/**
 * Delve battle tick hook — mirrors useArenaBattleTick but for multi-mob combat.
 *
 * Tick loop:
 *   1. Every 500ms, read current battle state from delveStore
 *   2. If battle complete:
 *      - Victory → grant rewards (gold, chests, materials to runInventory),
 *                  submit heartbeat for floor clear, advance to next floor
 *      - Defeat  → call dieInRun() (HC wipes stake; casual ends cleanly)
 *   3. Rest floor = no battle; user chooses extract or continue
 */

import { useEffect, useRef } from 'react'
import { useDelveStore, selectActiveRun } from '../stores/delveStore'
import { useInventoryStore } from '../stores/inventoryStore'
import { useToastStore } from '../stores/toastStore'
import { useNotificationStore } from '../stores/notificationStore'
import { CHEST_DEFS, type ChestType } from '../lib/loot'
import { submitFloorHeartbeat, registerRunStart, submitRunEnd } from '../services/delveLeaderboardService'
import { getIsoWeek } from '../stores/delveStore'
import { track } from '../lib/analytics'
import { rollFloorFragments } from '../lib/delveFragments'
import { aggregateRunMultipliers } from '../lib/delvePerks'
import type { TabId } from '../App'

// Roll materials/gold from a cleared wave or boss floor
function rollFloorRewards(floor: number, kind: 'wave' | 'boss'): { gold: number; chests: ChestType[] } {
  const isBoss = kind === 'boss'
  const goldBase = isBoss ? 60 + floor * 10 : 15 + floor * 3
  const gold = Math.floor(goldBase * (0.8 + Math.random() * 0.4))
  const chests: ChestType[] = []
  if (isBoss) {
    // Boss floor: guaranteed chest, tier scales with depth
    let tier: ChestType = 'common_chest'
    if (floor >= 50) tier = 'legendary_chest'
    else if (floor >= 30) tier = 'epic_chest'
    else if (floor >= 10) tier = 'rare_chest'
    chests.push(tier)
  } else if (Math.random() < 0.08 + floor * 0.003) {
    // Wave floor: small chance of bonus chest
    chests.push('common_chest')
  }
  return { gold, chests }
}

export function useDelveBattleTick(activeTab?: TabId) {
  const run = useDelveStore(selectActiveRun)
  const advanceFloor = useDelveStore((s) => s.advanceFloor)
  const addRunLoot = useDelveStore((s) => s.addRunLoot)
  const dieInRun = useDelveStore((s) => s.dieInRun)
  const pushToast = useToastStore((s) => s.push)
  const pushNotification = useNotificationStore((s) => s.push)
  const activeTabRef = useRef(activeTab)
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])
  const completedRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heartbeatSentRef = useRef<Set<number>>(new Set())
  const startRegisteredRef = useRef(false)
  /** When the run ends from inside the tick (death OR auto-extract at cap), this fires
   *  toast + bell. Skipped if user is currently on the Delve tab — they'll see the
   *  result modal directly so the notif would be redundant. */
  const lastSeenResultIdRef = useRef<number | null>(null)

  // Register run on mount (once) — leaderboard row is created here
  useEffect(() => {
    if (!run) return
    if (startRegisteredRef.current) return
    startRegisteredRef.current = true
    const stakedSummary = { ...run.stakedManifest.items }
    void registerRunStart(run.runId, run.mode, stakedSummary, getIsoWeek())
  }, [run])

  useEffect(() => {
    if (!run) {
      completedRef.current = false
      heartbeatSentRef.current.clear()
      startRegisteredRef.current = false
      return
    }

    function maybeFireEndNotif() {
      const pending = useDelveStore.getState().pendingResult
      if (!pending) return
      if (lastSeenResultIdRef.current === pending.createdAt) return
      lastSeenResultIdRef.current = pending.createdAt
      // If user is already on the Delve tab, the result modal handles the UX.
      if (activeTabRef.current === 'delve') return
      const isDeath = pending.kind === 'death'
      const floor = pending.data.finalFloor
      const modeLabel = pending.mode === 'hardcore' ? 'HC' : 'Practice'
      const title = isDeath
        ? `Drift ended — sector ${floor}`
        : `Returned safely — sector ${floor}`
      const body = isDeath
        ? pending.mode === 'hardcore'
          ? 'Hardcore — your equipped gear was lost.'
          : 'Practice run ended. Loot lost, gear safe.'
        : `${modeLabel} · +${pending.data.fragmentsBanked} shards banked`
      const notifId = pushNotification({
        type: 'progression',
        icon: isDeath ? '☠' : '✦',
        title,
        body,
      })
      if (notifId) {
        pushToast({
          kind: 'generic',
          message: title,
          type: isDeath ? 'error' : 'success',
        })
      }
    }

    const tick = () => {
      // Surface end-of-run notif even when ambient state lingers across re-renders.
      maybeFireEndNotif()

      const state = useDelveStore.getState().getBattleState()
      if (!state || completedRef.current) {
        // Rest floor: auto-advance after a short pause (purely flavor — there's nothing to choose).
        // Rubicon floor: NEVER auto-advance — the user must pick or skip via the RubiconFloorView UI.
        const currentRun = useDelveStore.getState().activeRun
        if (currentRun && currentRun.currentFloorSpec?.kind === 'rest' && !completedRef.current) {
          completedRef.current = true
          timeoutRef.current = setTimeout(() => {
            completedRef.current = false
            useDelveStore.getState().advanceFloor()
          }, 2000)
        }
        return
      }

      if (!state.isComplete) return

      completedRef.current = true
      const victory = state.victory === true
      const currentRun = useDelveStore.getState().activeRun
      if (!currentRun) return
      const spec = currentRun.currentFloorSpec
      const kind = spec?.kind === 'boss' ? 'boss' : 'wave'

      timeoutRef.current = setTimeout(() => {
        if (!victory) {
          // About to die — give Phoenix Tear a chance first.
          const revived = useDelveStore.getState().attemptRevive()
          if (revived) {
            pushToast({
              kind: 'generic',
              message: 'Phoenix Tear consumed — revived at 25% HP',
              type: 'success',
            })
            track('delve_phoenix_revive_used', { mode: currentRun.mode, floor: currentRun.currentFloor })
            // Reset the tick state so combat resumes on the same floor with new HP.
            completedRef.current = false
            return
          }
          // Death
          const result = dieInRun()
          if (result) {
            const record = {
              runId: currentRun.runId,
              mode: currentRun.mode,
              finalFloor: currentRun.currentFloor,
              died: true,
              goldGained: 0,
              lootCount: 0,
              durationSec: Math.floor((Date.now() - currentRun.startedAt) / 1000),
              startedAt: currentRun.startedAt,
              endedAt: Date.now(),
            }
            void submitRunEnd(record)
          }
          return
        }

        // Victory — grant rewards, advance floor
        const mults = aggregateRunMultipliers(currentRun.activePerks)
        const rewards = rollFloorRewards(currentRun.currentFloor, kind)
        const goldGain = Math.round(rewards.gold * mults.goldMult)
        if (goldGain > 0) addRunLoot({ kind: 'gold', id: 'gold', qty: goldGain })
        for (const c of rewards.chests) addRunLoot({ kind: 'chest', id: c, qty: 1 })

        // Fragment drop — the new currency. Goes to runFragments (in-run pool).
        const fragQty = rollFloorFragments({
          floor: currentRun.currentFloor,
          kind,
          mode: currentRun.mode,
          fragmentsMult: mults.fragmentsMult,
        })
        if (fragQty > 0) useDelveStore.getState().addRunFragments(fragQty)

        // Heartbeat (anti-cheat)
        if (!heartbeatSentRef.current.has(currentRun.currentFloor)) {
          heartbeatSentRef.current.add(currentRun.currentFloor)
          void submitFloorHeartbeat(currentRun.runId, currentRun.currentFloor)
        }

        track('delve_floor_clear', { floor: currentRun.currentFloor, kind, mode: currentRun.mode })

        // Update player HP on the run for next floor
        const updatedHp = state.playerHp
        useDelveStore.setState((s) => {
          if (!s.activeRun) return {}
          return { activeRun: { ...s.activeRun, playerHp: Math.max(1, updatedHp) } }
        })

        completedRef.current = false
        advanceFloor()
      }, 800)
    }

    tick()
    const interval = setInterval(tick, 500)
    return () => {
      clearInterval(interval)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
    // run is intentionally the only dep — re-run when run starts/stops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run])

  // Suppress "unused" for non-destructuring exports
  void useInventoryStore
  void CHEST_DEFS
}
