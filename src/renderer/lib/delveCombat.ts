/**
 * Multi-mob real-time combat simulation for Delve mode.
 *
 * Differences from arena (simulateBattleWithFood):
 *   - Player faces N mobs simultaneously (2-5)
 *   - Total enemy DPS is sum of all alive mobs
 *   - Player ATK is distributed across alive mobs based on mode:
 *       CLEAVE — damage split evenly across all alive targets (default)
 *       FOCUS  — damage concentrated on lowest-HP target (food-gated upgrade)
 *   - When a mob dies mid-wave, its DPS contribution zeroes out immediately
 *   - HP carries across floors (player HP not reset per wave)
 *
 * Combat tick: 0.5s like arena. Seeded PRNG for deterministic damage variance.
 *
 *   ┌────────── TICK (0.5s) ──────────┐
 *   │ 1. Sum alive mob DPS → player   │
 *   │ 2. Player HP -= enemyDps * step │
 *   │ 3. Distribute player ATK:       │
 *   │      CLEAVE = atk / aliveCount  │
 *   │      FOCUS  = atk → min-HP mob  │
 *   │ 4. Apply to each alive mob      │
 *   │ 5. Remove dead mobs             │
 *   │ 6. Check end: player<=0 or      │
 *   │    no mobs left                 │
 *   └─────────────────────────────────┘
 */

import type { MobDef, FoodLoadout, FoodConsumptionEvent } from './combat'
import { DEFAULT_ATK_SPREAD, effectivePlayerDps, effectiveBossDps } from './combat'
import type { CombatStats } from './loot'
import { FOOD_ITEM_MAP } from './cooking'

export const MAX_ACTIVE_MOBS = 5
const TICK_STEP = 0.5
const MAX_SIM_TIME = 600 // 10-minute cap (prevents runaway sims)

// Food buff stacking caps (mirror arena's simulateBattleWithFood)
const MAX_FOOD_BUFF_ATK = 25
const MAX_FOOD_BUFF_DEF = 15
const MAX_FOOD_BUFF_REGEN = 8

export type CombatMode = 'cleave' | 'focus'

// ── PRNG (copy of combat.ts mulberry32 — kept local to avoid export churn) ───

function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function variedDamage(base: number, spread: number, rng: () => number): number {
  const factor = 1 + (rng() * 2 - 1) * spread
  return base * factor
}

interface ActiveFoodBuff {
  atk: number
  def: number
  regen: number
  expiresAt: number
}

// ── Outcome types ────────────────────────────────────────────────────────────

export interface MultiMobBattleOutcome {
  willWin: boolean
  tWinSeconds: number
  tLoseSeconds: number
  playerHpRemaining: number        // HP left if won, 0 if died
  foodConsumed: Array<{ foodId: string; qty: number }>
  /** Per-mob death timestamps for UI strike-through animations. */
  mobDeaths: Array<{ mobIndex: number; atSeconds: number }>
}

export interface MultiMobBattleState {
  playerHp: number
  mobHps: number[]                 // per-mob current HP (0 = dead)
  elapsedSeconds: number
  isComplete: boolean
  victory: boolean | null
  foodEvents: FoodConsumptionEvent[]
  activeBuffs: { atk: number; def: number; regen: number }
  /** Index of the mob currently being focused (FOCUS mode) or -1 for CLEAVE. */
  focusTargetIndex: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function totalEnemyDps(
  mobs: MobDef[],
  mobHps: number[],
  playerRegen: number,
  playerDef: number,
  rng: () => number,
): number {
  let total = 0
  for (let i = 0; i < mobs.length; i++) {
    if (mobHps[i] <= 0) continue
    const mob = mobs[i]
    const spread = mob.atkSpread ?? DEFAULT_ATK_SPREAD
    const eAtk = variedDamage(mob.atk, spread, rng)
    total += effectiveBossDps(eAtk, playerRegen, playerDef)
  }
  return total
}

function pickFocusTarget(mobs: MobDef[], mobHps: number[]): number {
  let minHp = Infinity
  let idx = -1
  for (let i = 0; i < mobs.length; i++) {
    if (mobHps[i] > 0 && mobHps[i] < minHp) {
      minHp = mobHps[i]
      idx = i
    }
  }
  return idx
}

function countAlive(mobHps: number[]): number {
  let c = 0
  for (const hp of mobHps) if (hp > 0) c++
  return c
}

// ── Main simulation (outcome) ────────────────────────────────────────────────

export function simulateMultiMobBattle(
  player: CombatStats,
  mobs: MobDef[],
  foodLoadout: FoodLoadout | undefined,
  mode: CombatMode,
  seed: number,
): MultiMobBattleOutcome {
  // Guard: invalid inputs return safe results
  if (mobs.length === 0) {
    return { willWin: true, tWinSeconds: 0, tLoseSeconds: Infinity, playerHpRemaining: player.hp, foodConsumed: [], mobDeaths: [] }
  }
  if (mobs.length > MAX_ACTIVE_MOBS) {
    throw new Error(`simulateMultiMobBattle: MAX_ACTIVE_MOBS=${MAX_ACTIVE_MOBS} exceeded (got ${mobs.length})`)
  }
  if (!Number.isFinite(player.atk) || player.atk <= 0 || !Number.isFinite(player.hp) || player.hp <= 0) {
    return { willWin: false, tWinSeconds: Infinity, tLoseSeconds: 0, playerHpRemaining: 0, foodConsumed: [], mobDeaths: [] }
  }

  const rng = mulberry32(seed)
  let playerHp = player.hp
  let maxHp = player.hp
  const mobHps = mobs.map((m) => m.hp)
  const mobDeaths: Array<{ mobIndex: number; atSeconds: number }> = []
  const foodConsumed: Record<string, number> = {}
  const buffs: ActiveFoodBuff[] = []

  // Pre-battle food heal + buffs
  const slots = foodLoadout?.map((s) => (s ? { ...s } : null)) ?? []
  for (const slot of slots) {
    if (!slot || slot.qty <= 0) continue
    slot.qty--
    foodConsumed[slot.foodId] = (foodConsumed[slot.foodId] ?? 0) + 1
    const eff = slot.effect
    if (eff.heal) { maxHp += eff.heal; playerHp += eff.heal }
    if (eff.buffAtk || eff.buffDef || eff.buffRegen) {
      buffs.push({
        atk: eff.buffAtk ?? 0,
        def: eff.buffDef ?? 0,
        regen: eff.buffRegen ?? 0,
        expiresAt: eff.buffDurationSec ?? 60,
      })
    }
  }

  let t = 0
  while (t < MAX_SIM_TIME) {
    // Active food buffs
    let bAtk = 0, bDef = 0, bRegen = 0
    for (const b of buffs) {
      if (t < b.expiresAt) { bAtk += b.atk; bDef += b.def; bRegen += b.regen }
    }
    bAtk = Math.min(bAtk, MAX_FOOD_BUFF_ATK)
    bDef = Math.min(bDef, MAX_FOOD_BUFF_DEF)
    bRegen = Math.min(bRegen, MAX_FOOD_BUFF_REGEN)

    // Enemy damage (sum of alive mobs)
    const eDps = totalEnemyDps(mobs, mobHps, player.hpRegen + bRegen, player.def + bDef, rng)
    playerHp -= eDps * TICK_STEP
    playerHp = Math.min(maxHp, playerHp)

    if (playerHp <= 0) {
      return {
        willWin: false,
        tWinSeconds: Infinity,
        tLoseSeconds: t + TICK_STEP,
        playerHpRemaining: 0,
        foodConsumed: Object.entries(foodConsumed).map(([foodId, qty]) => ({ foodId, qty })),
        mobDeaths,
      }
    }

    // Player damage distribution
    const aliveCount = countAlive(mobHps)
    if (aliveCount === 0) {
      return {
        willWin: true,
        tWinSeconds: t,
        tLoseSeconds: Infinity,
        playerHpRemaining: Math.max(0, playerHp),
        foodConsumed: Object.entries(foodConsumed).map(([foodId, qty]) => ({ foodId, qty })),
        mobDeaths,
      }
    }

    const pAtkBase = player.atk + bAtk
    if (mode === 'cleave') {
      const atkPerMob = pAtkBase / aliveCount
      for (let i = 0; i < mobs.length; i++) {
        if (mobHps[i] <= 0) continue
        const pAtk = variedDamage(atkPerMob, DEFAULT_ATK_SPREAD, rng)
        const pDps = effectivePlayerDps(pAtk, mobs[i].def ?? 0)
        mobHps[i] -= pDps * TICK_STEP
        if (mobHps[i] <= 0) {
          mobHps[i] = 0
          mobDeaths.push({ mobIndex: i, atSeconds: t + TICK_STEP })
        }
      }
    } else {
      // FOCUS — all damage to lowest-HP target
      const target = pickFocusTarget(mobs, mobHps)
      if (target !== -1) {
        const pAtk = variedDamage(pAtkBase, DEFAULT_ATK_SPREAD, rng)
        const pDps = effectivePlayerDps(pAtk, mobs[target].def ?? 0)
        mobHps[target] -= pDps * TICK_STEP
        if (mobHps[target] <= 0) {
          mobHps[target] = 0
          mobDeaths.push({ mobIndex: target, atSeconds: t + TICK_STEP })
        }
      }
    }

    t += TICK_STEP

    if (countAlive(mobHps) === 0) {
      return {
        willWin: true,
        tWinSeconds: t,
        tLoseSeconds: Infinity,
        playerHpRemaining: Math.max(0, playerHp),
        foodConsumed: Object.entries(foodConsumed).map(([foodId, qty]) => ({ foodId, qty })),
        mobDeaths,
      }
    }
  }

  // Timeout — treat as loss
  return {
    willWin: false,
    tWinSeconds: Infinity,
    tLoseSeconds: MAX_SIM_TIME,
    playerHpRemaining: 0,
    foodConsumed: Object.entries(foodConsumed).map(([foodId, qty]) => ({ foodId, qty })),
    mobDeaths,
  }
}

// ── State-at-time snapshot (for UI tick rendering) ───────────────────────────

export function computeMultiMobStateAtTime(
  player: CombatStats,
  mobs: MobDef[],
  foodLoadout: FoodLoadout | undefined,
  mode: CombatMode,
  elapsedSeconds: number,
  seed: number,
): MultiMobBattleState {
  if (mobs.length === 0) {
    return {
      playerHp: player.hp,
      mobHps: [],
      elapsedSeconds: 0,
      isComplete: true,
      victory: true,
      foodEvents: [],
      activeBuffs: { atk: 0, def: 0, regen: 0 },
      focusTargetIndex: -1,
    }
  }

  const rng = mulberry32(seed)
  let playerHp = player.hp
  let maxHp = player.hp
  const mobHps = mobs.map((m) => m.hp)
  const foodEvents: FoodConsumptionEvent[] = []
  const buffs: ActiveFoodBuff[] = []

  // Pre-battle food
  const slots = foodLoadout?.map((s) => (s ? { ...s } : null)) ?? []
  for (const slot of slots) {
    if (!slot || slot.qty <= 0) continue
    slot.qty--
    foodEvents.push({ atSeconds: 0, foodId: slot.foodId, healAmount: slot.effect.heal ?? 0 })
    const eff = slot.effect
    if (eff.heal) { maxHp += eff.heal; playerHp += eff.heal }
    if (eff.buffAtk || eff.buffDef || eff.buffRegen) {
      buffs.push({
        atk: eff.buffAtk ?? 0, def: eff.buffDef ?? 0, regen: eff.buffRegen ?? 0,
        expiresAt: eff.buffDurationSec ?? 60,
      })
    }
  }

  let t = 0
  let isComplete = false
  let victory: boolean | null = null

  while (t < elapsedSeconds && !isComplete) {
    let bAtk = 0, bDef = 0, bRegen = 0
    for (const b of buffs) {
      if (t < b.expiresAt) { bAtk += b.atk; bDef += b.def; bRegen += b.regen }
    }
    bAtk = Math.min(bAtk, MAX_FOOD_BUFF_ATK)
    bDef = Math.min(bDef, MAX_FOOD_BUFF_DEF)
    bRegen = Math.min(bRegen, MAX_FOOD_BUFF_REGEN)

    const eDps = totalEnemyDps(mobs, mobHps, player.hpRegen + bRegen, player.def + bDef, rng)
    playerHp -= eDps * TICK_STEP
    playerHp = Math.min(maxHp, playerHp)

    if (playerHp <= 0) { isComplete = true; victory = false; break }

    const aliveCount = countAlive(mobHps)
    if (aliveCount === 0) { isComplete = true; victory = true; break }

    const pAtkBase = player.atk + bAtk
    if (mode === 'cleave') {
      const atkPerMob = pAtkBase / aliveCount
      for (let i = 0; i < mobs.length; i++) {
        if (mobHps[i] <= 0) continue
        const pAtk = variedDamage(atkPerMob, DEFAULT_ATK_SPREAD, rng)
        const pDps = effectivePlayerDps(pAtk, mobs[i].def ?? 0)
        mobHps[i] = Math.max(0, mobHps[i] - pDps * TICK_STEP)
      }
    } else {
      const target = pickFocusTarget(mobs, mobHps)
      if (target !== -1) {
        const pAtk = variedDamage(pAtkBase, DEFAULT_ATK_SPREAD, rng)
        const pDps = effectivePlayerDps(pAtk, mobs[target].def ?? 0)
        mobHps[target] = Math.max(0, mobHps[target] - pDps * TICK_STEP)
      }
    }

    t += TICK_STEP

    if (countAlive(mobHps) === 0) { isComplete = true; victory = true }
  }

  // Current active buffs
  let cAtk = 0, cDef = 0, cRegen = 0
  for (const b of buffs) {
    if (elapsedSeconds < b.expiresAt) { cAtk += b.atk; cDef += b.def; cRegen += b.regen }
  }
  cAtk = Math.min(cAtk, MAX_FOOD_BUFF_ATK)
  cDef = Math.min(cDef, MAX_FOOD_BUFF_DEF)
  cRegen = Math.min(cRegen, MAX_FOOD_BUFF_REGEN)

  return {
    playerHp: Math.max(0, playerHp),
    mobHps,
    elapsedSeconds: t,
    isComplete,
    victory,
    foodEvents,
    activeBuffs: { atk: cAtk, def: cDef, regen: cRegen },
    focusTargetIndex: mode === 'focus' ? pickFocusTarget(mobs, mobHps) : -1,
  }
}

// ── Combat mode selection helper ─────────────────────────────────────────────

/**
 * Determine current combat mode from food loadout. FOCUS mode is unlocked by
 * equipping "commanders_stew" food (any quantity in any slot).
 */
export function getCurrentCombatMode(foodLoadout: FoodLoadout | undefined): CombatMode {
  if (!foodLoadout) return 'cleave'
  for (const slot of foodLoadout) {
    if (!slot || slot.qty <= 0) continue
    const def = FOOD_ITEM_MAP[slot.foodId]
    // Commanders stew is not yet a registered food — when it's added to cooking.ts,
    // this check will match. For now, return 'cleave' as default.
    if (slot.foodId === 'commanders_stew' && def) return 'focus'
  }
  return 'cleave'
}
