/**
 * Delve Mode — Abyss Descent store.
 *
 * State machine:
 *
 *   ┌──────┐   stakeAndStart   ┌────────────┐   advanceFloor  ┌──────────┐
 *   │ IDLE ├──────────────────▶│ IN_WAVE    ├────────────────▶│ BETWEEN  │
 *   └──────┘                   └─────┬──────┘                  │ _FLOORS  │
 *      ▲                             │                         └────┬─────┘
 *      │                             │ player_died                  │
 *      │                             │                              │ next
 *      │          extractRun /       ▼                              ▼
 *      │          dieInRun        (GAME_OVER)                    IN_WAVE |
 *      └──────────────────────────────┘                          BOSS    |
 *                                                                REST
 *
 * Zustand selector rule (per CLAUDE.md):
 *   Never return a new object/array reference directly from a selector.
 *   Good:  const run = useDelveStore(s => s.activeRun)
 *   Bad:   const chests = useDelveStore(s => s.activeRun?.runInventory.filter(...))
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CombatStats, LootSlot } from './../lib/loot'
import type { FoodLoadout, MobDef, BossDef } from './../lib/combat'
import { composePlayerSnapshot } from './../lib/playerStats'
import {
  generateFloor, getFloorWarriorXP,
  DELVE_FLOOR_CAP, type DelveFloorSpec,
} from './../lib/delveGen'
import {
  computeMultiMobStateAtTime, getCurrentCombatMode,
  type MultiMobBattleState,
} from './../lib/delveCombat'
import { checkMilestoneUnlocks } from './../lib/delveCosmetics'
import { applyPerksToStats, getPerkById, type DelvePerkDef } from './../lib/delvePerks'
import {
  applyMetaUpgradesToStats, getMetaUpgradeById, getNextRankCost,
  getStartingFragments, getRunInventoryCap,
} from './../lib/delveMetaUpgrades'
import { getCacheItemById } from './../lib/delveCacheItems'
import { useInventoryStore } from './inventoryStore'
import { useGoldStore } from './goldStore'
import { useAuthStore } from './authStore'
import { useAchievementStatsStore } from './achievementStatsStore'
import { grantWarriorXP } from '../lib/farming'
import { track } from '../lib/analytics'

// ── Constants ────────────────────────────────────────────────────────────────

/** Default run-inventory cap. Effective cap can be higher via Deep Pockets meta-upgrade. */
export const RUN_INVENTORY_CAP = 64
/** Default soft warning threshold (cap − 2). */
export const RUN_INVENTORY_WARN = 62
/** Gold tax % when extracting on a non-rest floor (CEO design: cowardice tax). */
export const EXTRACT_TAX_PCT = 20
/** Max off-tab resolution duration (prevents abuse). */
export const MAX_OFFTAB_SECONDS = 600

// ── Types ────────────────────────────────────────────────────────────────────

export interface StakeManifest {
  /** Snapshot of equipped slots at stake time (read-only record). */
  equipped: Partial<Record<LootSlot, string>>
  /** Inventory items committed — map of itemId → qty (max 8 distinct ids). */
  items: Record<string, number>
  /** Food loadout — copied into activeRun.foodLoadout, consumed during run. */
  food: FoodLoadout
}

export type RunLootKind = 'chest' | 'material' | 'gold'

export interface RunLootItem {
  kind: RunLootKind
  /** For chest: ChestType. For material: itemId. For gold: unused (qty is the value). */
  id: string
  qty: number
}

export interface ActiveDelveRun {
  runId: string
  mode: 'casual' | 'hardcore'
  seed: number
  currentFloor: number
  /** Cached spec of the floor currently being fought. */
  currentFloorSpec: DelveFloorSpec | null
  /** Base player stats with meta-upgrades applied (set once at stake time). */
  basePlayerSnapshot: CombatStats
  /** Effective player stats with active perks applied. Recomputed on perk purchase. */
  playerSnapshot: CombatStats
  /** HP carries across floors — NOT reset per wave. */
  playerHp: number
  /** Wall-clock timestamp when the current floor's combat started. Battle tick uses this. */
  floorStartTime: number
  foodLoadout: FoodLoadout
  runInventory: RunLootItem[]
  stakedManifest: StakeManifest
  /** In-run fragments collected so far. Spent at Rubicons; banked on extract/death. */
  runFragments: number
  /** IDs of perks the player has bought at Rubicons this run. */
  activePerks: string[]
  /** Whether the user has resolved (picked or skipped) the current Rubicon, if any. */
  rubiconResolvedFloor: number | null
  /** Phoenix Tear can revive once per run — flips true once consumed. */
  usedRevive: boolean
  startedAt: number
}

export interface DelveStakedPool {
  /** Which run stashed these — cleared on dieInRun/extractRun. */
  runId: string | null
  /** Equipped-slot snapshot held during HC run (returned on extract, wiped on die). */
  equipped: Partial<Record<LootSlot, string>>
  /** Item qty map held during HC run. */
  items: Record<string, number>
}

const EMPTY_STAKED_POOL: DelveStakedPool = { runId: null, equipped: {}, items: {} }

export interface DelveRunRecord {
  runId: string
  mode: 'casual' | 'hardcore'
  finalFloor: number
  died: boolean
  goldGained: number
  lootCount: number
  durationSec: number
  startedAt: number
  endedAt: number
}

export interface ExtractResult {
  finalFloor: number
  goldGained: number
  lootGranted: RunLootItem[]
  taxPaid: number
  cosmeticsUnlocked: string[]
  warriorXpGranted: number
  fragmentsBanked: number
}

export interface DeathResult {
  finalFloor: number
  itemsLost: Record<string, number>
  equippedLost: Partial<Record<LootSlot, string>>
  rank: number | null         // filled async after leaderboard submit
}

/** Recoverable result of the most recent finished run — survives until the user dismisses it. */
export type PendingResult =
  | { kind: 'extract'; data: ExtractResult; mode: 'casual' | 'hardcore'; createdAt: number }
  | { kind: 'death';   data: DeathResult;   mode: 'casual' | 'hardcore'; createdAt: number }

interface DelveState {
  activeRun: ActiveDelveRun | null
  stakedPool: DelveStakedPool
  pendingLeaderboardSubmits: DelveRunRecord[]
  maxFloor: { casual: number; hardcore: number }
  cosmeticsUnlocked: string[]
  /** Persistent fragment bank (out-of-run currency). */
  bankedFragments: number
  /** Permanent meta-upgrade ranks bought at the Abyssal Cache. */
  metaUpgradeRanks: Record<string, number>
  /** IDs of one-time Cache items already purchased. */
  unlockedCacheItems: string[]
  /** Transient post-run banner shown in HomePage ambient bar while off the Delve tab. */
  ambientResult: { type: 'extract' | 'death'; floor: number; createdAt: number } | null
  /** Last-finished-run result. Persists across tab switches until acknowledged. */
  pendingResult: PendingResult | null

  // Actions
  stakeAndStart: (mode: 'casual' | 'hardcore', manifest: StakeManifest) => boolean
  advanceFloor: () => void
  extractRun: () => ExtractResult | null
  dieInRun: () => DeathResult | null
  forfeitRun: () => void
  setAmbientResult: (v: DelveState['ambientResult']) => void
  /** Dismiss the result modal (clears pendingResult). */
  acknowledgeResult: () => void

  /** Compute current battle state from wall-clock elapsed (for UI tick rendering). */
  getBattleState: () => MultiMobBattleState | null
  /** Enqueue a loot drop into runInventory. Handles cap (soft warning; hard modal elsewhere). */
  addRunLoot: (item: RunLootItem) => void
  /** Drop a specific run-loot index to the floor (permanently discarded). */
  discardRunLootAt: (index: number) => void

  /** Add fragments to current run's pool. */
  addRunFragments: (qty: number) => void
  /** Buy a perk at the current Rubicon. Returns true on success. */
  purchasePerk: (perkId: string) => boolean
  /** Mark the current Rubicon as resolved (skipped or picks done) so battle tick can advance. */
  resolveCurrentRubicon: () => void
  /** Buy the next rank of a meta-upgrade with banked fragments. */
  purchaseMetaUpgrade: (id: string) => boolean
  /** Buy a Cache item with banked fragments. Returns true on success. */
  purchaseCacheItem: (id: string) => boolean
  /** Refund a previously-bought perk on the current beacon — gets shards back, removes effect. */
  refundPerk: (perkId: string) => boolean
  /** Replace foodLoadout on a rest floor. Caller validates via UI; no inventory transfer (food is reference-only in delve). */
  refreshFoodLoadout: (food: FoodLoadout) => boolean
  /** Drink an hp_potion from inventory: consumes 1, fully heals player HP. Rest floors only. Returns true on success. */
  drinkHealPotion: () => boolean
  /** Swap the equipped item in a slot during a rest floor. Recomputes playerSnapshot. Returns true on success. */
  swapEquippedDuringRun: (slot: LootSlot, newItemId: string | null) => boolean
  /**
   * Re-derive base + perked playerSnapshot from current inventory equippedBySlot.
   * Called by inventoryStore after equip/unequip happens during a transition phase
   * (rest/rubicon), so the run's combat stats track the new loadout. HP scales
   * proportionally — if you were at 70%, you're at 70% of the new max.
   */
  recomputeRunStatsFromGear: () => void
  /**
   * Phoenix Tear hook — call BEFORE dieInRun() in the battle tick.
   * If the player has a phoenix_tear in inventory and hasn't used one this run,
   * consumes one, restores HP to 25% of max, marks usedRevive=true, returns true.
   * Returns false if no revive happened (caller should proceed with dieInRun).
   */
  attemptRevive: () => boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRunId(): string {
  return `dv_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`
}

function makeRunSeed(): number {
  return (Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0
}

function getIsoWeek(date = new Date()): string {
  const year = date.getUTCFullYear()
  const start = Date.UTC(year, 0, 1)
  const diff = date.getTime() - start
  const week = Math.ceil((diff / 86400000 + new Date(start).getUTCDay() + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

// ── Store ────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'grindly_delve_state'

export const useDelveStore = create<DelveState>()(
  persist(
    (set, get) => ({
      activeRun: null,
      stakedPool: EMPTY_STAKED_POOL,
      pendingLeaderboardSubmits: [],
      maxFloor: { casual: 0, hardcore: 0 },
      cosmeticsUnlocked: [],
      bankedFragments: 0,
      metaUpgradeRanks: {},
      unlockedCacheItems: [],
      ambientResult: null,
      pendingResult: null,

      setAmbientResult: (v) => set({ ambientResult: v }),
      acknowledgeResult: () => set({ pendingResult: null }),

      stakeAndStart(mode, manifest) {
        const existing = get().activeRun
        if (existing) return false

        const rawSnapshot = composePlayerSnapshot()
        const metaRanks = get().metaUpgradeRanks
        // Meta-upgrades apply on top of base for the entire run.
        const basePlayerSnapshot = applyMetaUpgradesToStats(rawSnapshot, metaRanks)
        const playerSnapshot = basePlayerSnapshot // no perks yet
        const startingFragments = getStartingFragments(metaRanks)
        const runId = makeRunId()
        const seed = makeRunSeed()

        // HC mode: atomically move staked items out of main inventory
        if (mode === 'hardcore') {
          const manifestList = Object.entries(manifest.items)
            .filter(([, qty]) => qty > 0)
            .map(([id, qty]) => ({ id, qty }))
          const deducted = useInventoryStore.getState().transferOutForStake(manifestList)
          if (deducted === null) {
            // Insufficient items — caller should have validated, but bail gracefully
            return false
          }
          set({
            stakedPool: { runId, equipped: { ...manifest.equipped }, items: deducted },
          })
        } else {
          // Casual: no item move (stake is just a loadout snapshot for food/buff reference)
          set({ stakedPool: EMPTY_STAKED_POOL })
        }

        const spec = generateFloor(1, seed)
        const now = Date.now()

        set({
          activeRun: {
            runId,
            mode,
            seed,
            currentFloor: 1,
            currentFloorSpec: spec,
            basePlayerSnapshot,
            playerSnapshot,
            playerHp: playerSnapshot.hp,
            floorStartTime: now,
            foodLoadout: manifest.food,
            runInventory: [],
            stakedManifest: {
              equipped: { ...manifest.equipped },
              items: { ...manifest.items },
              food: manifest.food,
            },
            runFragments: startingFragments,
            activePerks: [],
            rubiconResolvedFloor: null,
            usedRevive: false,
            startedAt: now,
          },
        })
        track('delve_run_start', { mode, run_id: runId })
        return true
      },

      advanceFloor() {
        const run = get().activeRun
        if (!run) return

        const nextFloor = run.currentFloor + 1
        if (nextFloor > DELVE_FLOOR_CAP) {
          // Hard ceiling (MAX_FLOOR) — scaling caps and the engine can't honestly
          // generate beyond this. Auto-extract so the player keeps their loot.
          get().extractRun()
          return
        }

        const spec = generateFloor(nextFloor, run.seed)
        set({
          activeRun: {
            ...run,
            currentFloor: nextFloor,
            currentFloorSpec: spec,
            floorStartTime: Date.now(),
          },
        })
      },

      getBattleState() {
        const run = get().activeRun
        if (!run || !run.currentFloorSpec) return null
        const spec = run.currentFloorSpec
        if (spec.kind === 'rest' || spec.kind === 'rubicon') return null

        const mobs: MobDef[] = spec.kind === 'boss' && spec.boss
          ? [bossAsMob(spec.boss)]
          : spec.mobs

        // Apply mutator transform before sim
        let simPlayer = run.playerSnapshot
        let simMobs = mobs
        if (spec.mutator) {
          const out = spec.mutator.apply({
            playerAtk: run.playerSnapshot.atk,
            playerDef: run.playerSnapshot.def,
            mobs,
          })
          simPlayer = { ...simPlayer, atk: out.playerAtk, def: out.playerDef }
          simMobs = out.mobs
        }

        // Apply carried HP override (the sim assumes player.hp is max; we override with carried)
        const simPlayerWithCarriedHp: CombatStats = { ...simPlayer, hp: run.playerHp }

        const mode = getCurrentCombatMode(run.foodLoadout)
        const elapsed = Math.min(MAX_OFFTAB_SECONDS, (Date.now() - run.floorStartTime) / 1000)

        return computeMultiMobStateAtTime(
          simPlayerWithCarriedHp,
          simMobs,
          run.foodLoadout,
          mode,
          elapsed,
          run.seed ^ (spec.floor * 31),
        )
      },

      addRunLoot(item) {
        const run = get().activeRun
        if (!run) return
        const cap = getRunInventoryCap(get().metaUpgradeRanks)
        if (run.runInventory.length >= cap) {
          // Hard cap — caller must show forced-choice modal. Drop silently.
          return
        }
        set({ activeRun: { ...run, runInventory: [...run.runInventory, item] } })
      },

      addRunFragments(qty) {
        const run = get().activeRun
        if (!run || qty <= 0) return
        set({ activeRun: { ...run, runFragments: run.runFragments + qty } })
      },

      purchasePerk(perkId) {
        const run = get().activeRun
        if (!run) return false
        const perk = getPerkById(perkId)
        if (!perk) return false
        if (run.runFragments < perk.cost) return false
        if (run.activePerks.includes(perkId)) return false
        const newPerks = [...run.activePerks, perkId]
        // Recompute snapshot with the new perk applied
        const newSnapshot = applyPerksToStats(run.basePlayerSnapshot, newPerks)
        // HP scaling: if max HP increased, current HP gets the proportional boost too.
        const hpRatio = newSnapshot.hp / Math.max(1, run.playerSnapshot.hp)
        const newHp = Math.min(newSnapshot.hp, Math.round(run.playerHp * hpRatio))
        set({
          activeRun: {
            ...run,
            activePerks: newPerks,
            playerSnapshot: newSnapshot,
            playerHp: Math.max(1, newHp),
            runFragments: run.runFragments - perk.cost,
          },
        })
        track('delve_perk_buy', { perk_id: perkId, floor: run.currentFloor, cost: perk.cost })
        return true
      },

      refundPerk(perkId) {
        const run = get().activeRun
        if (!run) return false
        const perk = getPerkById(perkId)
        if (!perk) return false
        if (!run.activePerks.includes(perkId)) return false
        const newPerks = run.activePerks.filter((p) => p !== perkId)
        // Recompute snapshot without this perk
        const newSnapshot = applyPerksToStats(run.basePlayerSnapshot, newPerks)
        // HP scales proportionally — if you were at 80% HP before, you're at 80% after
        const hpRatio = newSnapshot.hp / Math.max(1, run.playerSnapshot.hp)
        const newHp = Math.max(1, Math.min(newSnapshot.hp, Math.round(run.playerHp * hpRatio)))
        set({
          activeRun: {
            ...run,
            activePerks: newPerks,
            playerSnapshot: newSnapshot,
            playerHp: newHp,
            runFragments: run.runFragments + perk.cost,
          },
        })
        track('delve_perk_refund', { perk_id: perkId, floor: run.currentFloor, refund: perk.cost })
        return true
      },

      resolveCurrentRubicon() {
        const run = get().activeRun
        if (!run) return
        if (run.currentFloorSpec?.kind !== 'rubicon') return
        set({ activeRun: { ...run, rubiconResolvedFloor: run.currentFloor } })
      },

      refreshFoodLoadout(food) {
        const run = get().activeRun
        if (!run) return false
        if (run.currentFloorSpec?.kind !== 'rest') return false
        set({ activeRun: { ...run, foodLoadout: food } })
        track('delve_food_refresh', { floor: run.currentFloor })
        return true
      },

      drinkHealPotion() {
        const run = get().activeRun
        if (!run) return false
        if (run.currentFloorSpec?.kind !== 'rest') return false
        const inv = useInventoryStore.getState()
        const owned = inv.items['hp_potion'] ?? 0
        if (owned <= 0) return false
        if (run.playerHp >= run.playerSnapshot.hp) return false // already full
        // Bypass consumePotion (it's blocked during delve and applies permanent stat).
        // We just delete 1 hp_potion and full-heal in-run HP.
        inv.deleteItem('hp_potion', 1)
        set({ activeRun: { ...run, playerHp: run.playerSnapshot.hp } })
        track('delve_heal_potion', { floor: run.currentFloor })
        return true
      },

      swapEquippedDuringRun(slot, newItemId) {
        const run = get().activeRun
        if (!run) return false
        const kind = run.currentFloorSpec?.kind
        if (kind !== 'rest' && kind !== 'rubicon') return false
        const inv = useInventoryStore.getState()
        if (newItemId) {
          const owned = (inv.items[newItemId] ?? 0) > 0
          if (!owned) return false
          // equipItem handles slot resolution + auto-unequip prior slot occupant.
          // It also calls notifyDelveGearChanged → recomputeRunStatsFromGear, so
          // playerSnapshot lands fresh without us doing it again here.
          inv.equipItem(newItemId)
        } else {
          inv.unequipSlot(slot)
        }
        track('delve_gear_swap', { floor: run.currentFloor, slot, item_id: newItemId ?? null })
        return true
      },

      recomputeRunStatsFromGear() {
        const run = get().activeRun
        if (!run) return
        const metaRanks = get().metaUpgradeRanks
        const rawSnapshot = composePlayerSnapshot()
        const newBase = applyMetaUpgradesToStats(rawSnapshot, metaRanks)
        const newSnapshot = applyPerksToStats(newBase, run.activePerks)
        // HP scales proportionally so swapping doesn't free-heal or insta-kill.
        const hpRatio = run.playerHp / Math.max(1, run.playerSnapshot.hp)
        const newHp = Math.max(1, Math.min(newSnapshot.hp, Math.round(newSnapshot.hp * hpRatio)))
        set({
          activeRun: {
            ...run,
            basePlayerSnapshot: newBase,
            playerSnapshot: newSnapshot,
            playerHp: newHp,
          },
        })
      },

      purchaseMetaUpgrade(id) {
        const def = getMetaUpgradeById(id)
        if (!def) return false
        const ranks = get().metaUpgradeRanks
        const currentRank = ranks[id] ?? 0
        const cost = getNextRankCost(id, currentRank)
        if (cost === null) return false
        if (get().bankedFragments < cost) return false
        set({
          bankedFragments: get().bankedFragments - cost,
          metaUpgradeRanks: { ...ranks, [id]: currentRank + 1 },
        })
        track('delve_meta_buy', { id, rank: currentRank + 1, cost })
        return true
      },

      purchaseCacheItem(id) {
        const def = getCacheItemById(id)
        if (!def) return false
        if (get().unlockedCacheItems.includes(id)) return false
        if (get().bankedFragments < def.cost) return false
        set({
          bankedFragments: get().bankedFragments - def.cost,
          unlockedCacheItems: [...get().unlockedCacheItems, id],
        })
        if (def.grant.kind === 'item') {
          useInventoryStore.getState().batchAddItems([{ id: def.grant.itemId, qty: def.grant.qty }])
        }
        track('delve_cache_buy', { id, cost: def.cost })
        return true
      },

      attemptRevive() {
        const run = get().activeRun
        if (!run) return false
        if (run.usedRevive) return false
        const inv = useInventoryStore.getState()
        const owned = inv.items['phoenix_tear'] ?? 0
        if (owned <= 0) return false
        // Consume one Phoenix Tear, restore HP to 25% of max, flip the flag.
        inv.deleteItem('phoenix_tear', 1)
        const revivedHp = Math.max(1, Math.ceil(run.playerSnapshot.hp * 0.25))
        set({
          activeRun: { ...run, usedRevive: true, playerHp: revivedHp, floorStartTime: Date.now() },
        })
        track('delve_phoenix_revive', { mode: run.mode, floor: run.currentFloor })
        return true
      },

      discardRunLootAt(index) {
        const run = get().activeRun
        if (!run) return
        if (index < 0 || index >= run.runInventory.length) return
        const newLoot = run.runInventory.slice()
        newLoot.splice(index, 1)
        set({ activeRun: { ...run, runInventory: newLoot } })
      },

      extractRun() {
        const run = get().activeRun
        if (!run) return null
        // Idempotent: clear first
        set({ activeRun: null })

        const isRestOrStart = !run.currentFloorSpec
          || run.currentFloorSpec.kind === 'rest'
          || run.currentFloorSpec.kind === 'rubicon'
          || run.currentFloor === 1
        const taxPct = isRestOrStart ? 0 : EXTRACT_TAX_PCT

        // Aggregate run loot
        const materialAdds: Record<string, number> = {}
        const chestCounts: Record<string, number> = {}
        let goldFromLoot = 0
        for (const l of run.runInventory) {
          if (l.kind === 'gold') goldFromLoot += l.qty
          else if (l.kind === 'material') materialAdds[l.id] = (materialAdds[l.id] ?? 0) + l.qty
          else if (l.kind === 'chest') chestCounts[l.id] = (chestCounts[l.id] ?? 0) + l.qty
        }
        const taxedGold = Math.floor(goldFromLoot * (1 - taxPct / 100))
        const taxPaid = goldFromLoot - taxedGold

        // Grant gold
        if (taxedGold > 0) {
          useGoldStore.getState().addGold(taxedGold)
          const uid = useAuthStore.getState().user?.id
          if (uid) useGoldStore.getState().syncToSupabase(uid)
        }

        // Grant materials (batched)
        const inv = useInventoryStore.getState()
        const matList = Object.entries(materialAdds).map(([id, qty]) => ({ id, qty }))
        if (matList.length) inv.batchAddItems(matList)

        // Grant chests
        for (const [chestType, qty] of Object.entries(chestCounts)) {
          for (let i = 0; i < qty; i++) {
            inv.addChest(chestType as never, 'session_complete', 100)
          }
        }

        // HC: return staked items to main inv
        if (run.mode === 'hardcore') {
          const { stakedPool } = get()
          if (stakedPool.runId === run.runId) {
            useInventoryStore.getState().transferInFromStake(stakedPool.items)
            set({ stakedPool: EMPTY_STAKED_POOL })
          }
        }

        // Update max floor
        const state = get()
        const bucket = run.mode === 'casual' ? 'casual' : 'hardcore'
        const newMax = Math.max(state.maxFloor[bucket], run.currentFloor)

        // Cosmetic milestone check (HC only)
        const cosmetics = checkMilestoneUnlocks(state.maxFloor.hardcore, run.currentFloor, run.mode)
        const newCosmetics = cosmetics
          .map((c) => c.id)
          .filter((id) => !state.cosmeticsUnlocked.includes(id))

        // Warrior XP: sum of per-floor XP across the run, biased by mode
        const warriorXp = getFloorWarriorXP(run.currentFloor, run.mode)
        if (warriorXp > 0) void grantWarriorXP(warriorXp)

        // Queue leaderboard submit
        const record: DelveRunRecord = {
          runId: run.runId,
          mode: run.mode,
          finalFloor: run.currentFloor,
          died: false,
          goldGained: taxedGold,
          lootCount: run.runInventory.length,
          durationSec: Math.floor((Date.now() - run.startedAt) / 1000),
          startedAt: run.startedAt,
          endedAt: Date.now(),
        }

        // Bank in-run fragments to persistent pool
        const fragmentsBanked = run.runFragments

        set({
          maxFloor: { ...state.maxFloor, [bucket]: newMax },
          cosmeticsUnlocked: [...state.cosmeticsUnlocked, ...newCosmetics],
          pendingLeaderboardSubmits: [...state.pendingLeaderboardSubmits, record],
          ambientResult: { type: 'extract', floor: run.currentFloor, createdAt: Date.now() },
          bankedFragments: state.bankedFragments + fragmentsBanked,
        })

        // Achievements
        useAchievementStatsStore.getState().incrementDungeonCompletions()
        track('delve_run_extract', {
          mode: run.mode, final_floor: run.currentFloor, gold: taxedGold, fragments: fragmentsBanked,
        })

        const result: ExtractResult = {
          finalFloor: run.currentFloor,
          goldGained: taxedGold,
          lootGranted: run.runInventory,
          taxPaid,
          cosmeticsUnlocked: newCosmetics,
          warriorXpGranted: warriorXp,
          fragmentsBanked,
        }
        // Stash for recoverable result modal (cleared on user dismiss).
        set({ pendingResult: { kind: 'extract', data: result, mode: run.mode, createdAt: Date.now() } })
        return result
      },

      dieInRun() {
        const run = get().activeRun
        if (!run) return null
        // Idempotent
        set({ activeRun: null })

        let itemsLost: Record<string, number> = {}
        let equippedLost: Partial<Record<LootSlot, string>> = {}

        if (run.mode === 'hardcore') {
          const { stakedPool } = get()
          if (stakedPool.runId === run.runId) {
            itemsLost = { ...stakedPool.items }
            equippedLost = { ...stakedPool.equipped }
            // Wipe stakedPool — items are GONE. No return to main inventory.
            // Also unequip the staked equipment slots from main inv atomically.
            const inv = useInventoryStore.getState()
            for (const slot of Object.keys(stakedPool.equipped) as LootSlot[]) {
              const eqId = stakedPool.equipped[slot]
              if (!eqId) continue
              inv.unequipSlot(slot)
              inv.deleteItem(eqId, 1)
            }
            set({ stakedPool: EMPTY_STAKED_POOL })
          }
        }
        // Casual: staked items untouched (no move happened at stake). runInventory just vanishes.

        // Update max floor (death still counts for the floor you reached)
        const state = get()
        const bucket = run.mode === 'casual' ? 'casual' : 'hardcore'
        const newMax = Math.max(state.maxFloor[bucket], run.currentFloor)

        // Warrior XP on death — half rate
        const warriorXp = Math.floor(getFloorWarriorXP(run.currentFloor, run.mode) / 2)
        if (warriorXp > 0) void grantWarriorXP(warriorXp)

        const record: DelveRunRecord = {
          runId: run.runId,
          mode: run.mode,
          finalFloor: run.currentFloor,
          died: true,
          goldGained: 0,
          lootCount: 0,
          durationSec: Math.floor((Date.now() - run.startedAt) / 1000),
          startedAt: run.startedAt,
          endedAt: Date.now(),
        }

        // Fragments are EARNED by killing mobs — they survive HC death and bank as well.
        const fragmentsBanked = run.runFragments

        set({
          maxFloor: { ...state.maxFloor, [bucket]: newMax },
          pendingLeaderboardSubmits: [...state.pendingLeaderboardSubmits, record],
          ambientResult: { type: 'death', floor: run.currentFloor, createdAt: Date.now() },
          bankedFragments: state.bankedFragments + fragmentsBanked,
        })

        track('delve_run_death', {
          mode: run.mode,
          final_floor: run.currentFloor,
          items_lost: Object.keys(itemsLost).length,
          fragments_banked: fragmentsBanked,
        })

        const result: DeathResult = {
          finalFloor: run.currentFloor,
          itemsLost,
          equippedLost,
          rank: null,
        }
        set({ pendingResult: { kind: 'death', data: result, mode: run.mode, createdAt: Date.now() } })
        return result
      },

      forfeitRun() {
        const run = get().activeRun
        if (!run) return
        // Treated as death if HC, extract-with-0-loot if casual
        if (run.mode === 'hardcore') get().dieInRun()
        else {
          set({ activeRun: null, stakedPool: EMPTY_STAKED_POOL })
        }
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({
        activeRun: s.activeRun,
        stakedPool: s.stakedPool,
        pendingLeaderboardSubmits: s.pendingLeaderboardSubmits,
        maxFloor: s.maxFloor,
        cosmeticsUnlocked: s.cosmeticsUnlocked,
        bankedFragments: s.bankedFragments,
        metaUpgradeRanks: s.metaUpgradeRanks,
        unlockedCacheItems: s.unlockedCacheItems,
      }),
    },
  ),
)

// Avoid unused-const warning: keep for future weekly reset lookups.
export { getIsoWeek }

// ── Helpers for type coercion ────────────────────────────────────────────────

function bossAsMob(boss: BossDef): MobDef {
  return {
    id: boss.id,
    name: boss.name,
    icon: boss.icon,
    image: boss.image,
    hp: boss.hp,
    atk: boss.atk,
    def: boss.def,
    atkSpread: boss.atkSpread,
    xpReward: 0,
    goldMin: 0,
    goldMax: 0,
  }
}

// ── Selectors (stable references per CLAUDE.md rule) ─────────────────────────

export const selectActiveRun = (s: DelveState) => s.activeRun
export const selectIsHCActive = (s: DelveState) =>
  s.activeRun !== null && s.activeRun.mode === 'hardcore'
export const selectMaxFloor = (s: DelveState) => s.maxFloor
export const selectCosmeticsUnlocked = (s: DelveState) => s.cosmeticsUnlocked
export const selectBankedFragments = (s: DelveState) => s.bankedFragments
export const selectMetaUpgradeRanks = (s: DelveState) => s.metaUpgradeRanks
export const selectUnlockedCacheItems = (s: DelveState) => s.unlockedCacheItems

/** Resolve all owned perks to their full def objects. Pure helper. */
export function resolveActivePerkDefs(perkIds: string[]): DelvePerkDef[] {
  return perkIds.map((id) => getPerkById(id)).filter((p): p is DelvePerkDef => p !== null)
}
