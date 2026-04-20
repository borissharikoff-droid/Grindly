import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { useAchievementStatsStore } from './achievementStatsStore'

let _syncDebounceTimer: ReturnType<typeof setTimeout> | null = null
// Delta-based sync: local changes accumulate here until the next flush.
// On RPC success the server returns the new authoritative total, which we combine with
// any further changes queued during flight. Last-write-wins is avoided — two devices
// earning gold concurrently both get credited.
let _unsyncedDelta = 0
let _inflightDelta = 0

interface GoldState {
  gold: number
  setGold: (amount: number) => void
  addGold: (amount: number) => void
  syncFromSupabase: (userId: string) => Promise<void>
  syncToSupabase: (userId: string) => Promise<void>
}

export const useGoldStore = create<GoldState>((set) => ({
  gold: 0,

  setGold(amount: number) {
    // Absolute set — only safe when the caller knows the new value matches
    // server-authoritative state (e.g. after a fresh pull). Does NOT queue a delta.
    set({ gold: Math.max(0, amount) })
  },

  addGold(amount: number) {
    set((s) => {
      const newGold = Math.max(0, s.gold + amount)
      const applied = newGold - s.gold
      _unsyncedDelta += applied
      if (newGold > 0) useAchievementStatsStore.getState().updateMaxGold(newGold)
      return { gold: newGold }
    })
  },

  async syncFromSupabase(userId: string) {
    if (!supabase) return
    // Skip while any local write is pending, in-flight, or unflushed — otherwise a
    // stale cloud read could silently revert fresh local earnings.
    if (_syncDebounceTimer || _unsyncedDelta !== 0 || _inflightDelta !== 0) return
    const { data } = await supabase
      .from('profiles')
      .select('gold')
      .eq('id', userId)
      .single()
    if (_syncDebounceTimer || _unsyncedDelta !== 0 || _inflightDelta !== 0) return
    if (data && typeof (data as { gold?: number }).gold === 'number') {
      set({ gold: Math.max(0, (data as { gold: number }).gold) })
    }
  },

  syncToSupabase(_userId: string): Promise<void> {
    if (!supabase) return Promise.resolve()
    if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer)
    return new Promise((resolve) => {
      _syncDebounceTimer = setTimeout(async () => {
        _syncDebounceTimer = null
        if (_unsyncedDelta === 0) { resolve(); return }
        _inflightDelta = _unsyncedDelta
        _unsyncedDelta = 0
        try {
          // Delta RPC — server uses SELECT...FOR UPDATE for atomic read-modify-write.
          // Concurrent earnings from another device are preserved in the returned total.
          const { data, error } = await supabase!
            .rpc('sync_gold_delta', { p_delta: _inflightDelta })
          if (error) {
            console.warn('[goldStore] syncToSupabase failed:', error.message)
            _unsyncedDelta += _inflightDelta
          } else if (typeof data === 'number') {
            // Re-apply any local deltas that accumulated during flight so they aren't lost.
            set({ gold: Math.max(0, data + _unsyncedDelta) })
          }
        } finally {
          _inflightDelta = 0
          resolve()
        }
      }, 500)
    })
  },
}))
