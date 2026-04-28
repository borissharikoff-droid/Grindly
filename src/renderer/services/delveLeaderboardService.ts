/**
 * Delve leaderboard & run submission service.
 *
 * Flow:
 *   1. On every advanceFloor() → submitFloorHeartbeat(runId, floor)
 *      Server records its own timestamp — client cannot forge.
 *   2. On extract or die → submitRunEnd(runId, ...)
 *      Server validates heartbeat chain + minimum time per floor.
 *      If valid: updates profiles.max_delve_floor_hc/casual.
 *      If invalid: run still stored, but max floor NOT updated (leaderboard position only).
 *   3. fetchWeeklyTop(N) — public read, joins profiles for display names
 *
 * All writes are retried via delveStore.pendingLeaderboardSubmits queue.
 */

import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { DelveRunRecord } from '../stores/delveStore'

declare const __APP_VERSION__: string
const clientVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'

// ── Heartbeat (per-floor server-side timestamp) ─────────────────────────────

export async function submitFloorHeartbeat(runId: string, floor: number): Promise<boolean> {
  if (!supabase) return false
  const user = useAuthStore.getState().user
  if (!user) return false
  const { error } = await supabase
    .from('delve_run_heartbeats')
    .insert({ run_id: runId, floor })
  if (error) {
    console.warn('[delve] heartbeat failed', error.message)
    return false
  }
  return true
}

// ── Run registration (called once at stake) ─────────────────────────────────

export async function registerRunStart(
  runId: string,
  mode: 'casual' | 'hardcore',
  stakedItems: Record<string, number>,
  weekIso: string,
): Promise<boolean> {
  if (!supabase) return false
  const user = useAuthStore.getState().user
  if (!user) return false
  const { error } = await supabase.from('delve_runs').insert({
    run_id: runId,
    user_id: user.id,
    mode,
    final_floor: 0,
    died: false,
    staked_items_json: stakedItems,
    week_iso: weekIso,
    started_at: new Date().toISOString(),
    client_version: clientVersion,
  })
  if (error) {
    console.warn('[delve] registerRunStart failed', error.message)
    return false
  }
  return true
}

// ── Final submission (uses RPC for anti-cheat validation) ───────────────────

export interface SubmitRunEndResult {
  ok: boolean
  valid: boolean
  reason: string | null
}

export async function submitRunEnd(record: DelveRunRecord): Promise<SubmitRunEndResult> {
  if (!supabase) return { ok: false, valid: false, reason: 'no_supabase' }
  const { data, error } = await supabase.rpc('submit_delve_run_end', {
    p_run_id: record.runId,
    p_final_floor: record.finalFloor,
    p_died: record.died,
    p_gold_gained: record.goldGained,
    p_duration_s: record.durationSec,
    p_loot_json: { count: record.lootCount },
  })
  if (error) {
    console.warn('[delve] submitRunEnd failed', error.message)
    return { ok: false, valid: false, reason: error.message }
  }
  const payload = (data ?? {}) as { ok?: boolean; valid?: boolean; reason?: string | null }
  return {
    ok: payload.ok ?? true,
    valid: payload.valid ?? true,
    reason: payload.reason ?? null,
  }
}

// ── Cosmetic unlock sync ────────────────────────────────────────────────────

export async function unlockCosmetic(cosmeticId: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('unlock_delve_cosmetic', { p_cosmetic_id: cosmeticId })
  if (error) {
    console.warn('[delve] unlockCosmetic failed', error.message)
    return false
  }
  return true
}

// ── Weekly leaderboard fetch ────────────────────────────────────────────────

export interface LeaderboardRow {
  rank: number
  userId: string
  displayName: string
  floor: number
  runId: string
  endedAt: string
  /** Profile fields for richer rendering (mirrors Social Leaderboard). */
  avatarUrl?: string | null
  equippedFrame?: string | null
  guildTag?: string | null
  streakCount?: number
}

export async function fetchWeeklyTop(
  weekIso: string,
  mode: 'casual' | 'hardcore',
  limit = 10,
): Promise<LeaderboardRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('delve_runs')
    .select('run_id, user_id, final_floor, ended_at, profiles:user_id (username, avatar_url, equipped_frame, streak_count)')
    .eq('week_iso', weekIso)
    .eq('mode', mode)
    .gt('final_floor', 0)
    .order('final_floor', { ascending: false })
    .order('ended_at', { ascending: true })
    .limit(limit)
  if (error) {
    console.warn('[delve] fetchWeeklyTop failed', error.message)
    return []
  }
  const rows: LeaderboardRow[] = (data ?? []).map((row, idx) => {
    const profile = (row as {
      profiles?: { username?: string; avatar_url?: string | null; equipped_frame?: string | null; streak_count?: number }
    }).profiles
    return {
      rank: idx + 1,
      userId: (row as { user_id: string }).user_id,
      displayName: profile?.username ?? 'Anonymous',
      floor: (row as { final_floor: number }).final_floor,
      runId: (row as { run_id: string }).run_id,
      endedAt: (row as { ended_at: string }).ended_at,
      avatarUrl: profile?.avatar_url ?? null,
      equippedFrame: profile?.equipped_frame ?? null,
      streakCount: profile?.streak_count ?? 0,
    }
  })
  // Best-effort guild-tag enrichment
  try {
    const { fetchGuildTagsForUsers } = await import('./guildService')
    const ids = rows.map((r) => r.userId)
    const tags = await fetchGuildTagsForUsers(ids)
    for (const r of rows) r.guildTag = tags[r.userId]?.tag ?? null
  } catch { /* non-fatal */ }
  return rows
}

export async function fetchMyRank(
  weekIso: string,
  mode: 'casual' | 'hardcore',
): Promise<{ rank: number; floor: number } | null> {
  if (!supabase) return null
  const user = useAuthStore.getState().user
  if (!user) return null
  const { data: mine } = await supabase
    .from('delve_runs')
    .select('final_floor')
    .eq('week_iso', weekIso)
    .eq('mode', mode)
    .eq('user_id', user.id)
    .order('final_floor', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!mine) return null
  const myFloor = (mine as { final_floor: number }).final_floor
  // Count how many distinct users beat this floor
  const { data: higher } = await supabase
    .from('delve_runs')
    .select('user_id', { count: 'exact', head: false })
    .eq('week_iso', weekIso)
    .eq('mode', mode)
    .gt('final_floor', myFloor)
  const aboveCount = higher?.length ?? 0
  return { rank: aboveCount + 1, floor: myFloor }
}
