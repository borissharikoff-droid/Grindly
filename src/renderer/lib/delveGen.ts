/**
 * Delve floor generator — pure functions, no store dependencies.
 *
 * Floor structure:
 *   - Every 10th floor (10, 20, 30, ...) = boss floor
 *   - Every (10N - 1) floor (9, 19, 29, ...) = rest floor (free extract + shop)
 *   - All other floors = wave of 2-5 mobs depending on depth band
 *
 * Scaling (HP/ATK multipliers grow with floor; gold scales with reward band):
 *   - Floor 1-10:  modest curve (onboarding)
 *   - Floor 11-30: steady climb (mid-game)
 *   - Floor 31+:   steep curve (endgame)
 *
 * Wave sizes:
 *   - Floor 1-5:   2 mobs
 *   - Floor 6-15:  3 mobs
 *   - Floor 16-30: 4 mobs
 *   - Floor 31+:   5 mobs
 *
 * Mutators kick in at floor 15+ (earlier than CEO-initial-30 per eng-review feedback
 * that floors 1-14 were flat). Deterministic by (floor, runSeed).
 */

import type { MobDef, BossDef } from './combat'
import { ZONES } from './combat'

// ── Constants ────────────────────────────────────────────────────────────────

export const MAX_FLOOR = 999
/** Length of one "cycle" — boss every N floors, rest before, beacon mid-cycle. */
export const DELVE_CYCLE_LENGTH = 10
/** Soft cap kept for back-compat reads. The run no longer auto-extracts here — drift is endless up to MAX_FLOOR. */
export const DELVE_FLOOR_CAP = MAX_FLOOR
export const MAX_ACTIVE_MOBS = 5
export const MUTATOR_FLOOR_THRESHOLD = 15

/**
 * Beacons (Rubicon perk shops) — endless cadence:
 *   - Floor 5: early-run pre-first-boss beacon.
 *   - Floor 12, 22, 32, … : one beacon mid-cycle after each boss (cycle = 10 floors).
 */
export function isRubiconFloor(floor: number): boolean {
  if (floor === 5) return true
  return floor > 10 && floor % 10 === 2
}

// ── Seeded PRNG (mulberry32 — same as combat.ts) ─────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Floor kind + wave size ───────────────────────────────────────────────────

export type FloorKind = 'wave' | 'boss' | 'rest' | 'rubicon'

export function getFloorKind(floor: number): FloorKind {
  if (floor <= 0) return 'wave'
  if (isRubiconFloor(floor)) return 'rubicon'
  if (floor % 10 === 0) return 'boss'
  if (floor % 10 === 9) return 'rest'
  return 'wave'
}

export function getWaveSize(floor: number): number {
  if (floor <= 8) return 2
  if (floor <= 20) return 3
  if (floor <= 40) return 4
  return 5
}

// ── Scaling curves ───────────────────────────────────────────────────────────

export interface DepthScaling {
  hpMult: number
  atkMult: number
  goldMult: number
  xpMult: number
}

/** Piecewise scaling. Capped at floor 999 so no Infinity. */
export function getDepthScaling(floor: number): DepthScaling {
  const f = Math.max(1, Math.min(MAX_FLOOR, Math.floor(floor)))

  // Tuned post-playtest: floor 15 was a hard wall in top gear. Gentler exponents
  // pull the early/mid curve down so meta-upgrades + perks can keep up.
  // hpMult(1)  ≈ 1.0   atkMult(1)  ≈ 1.0
  // hpMult(10) ≈ 2.0   atkMult(10) ≈ 1.7
  // hpMult(15) ≈ 2.6   atkMult(15) ≈ 2.1
  // hpMult(30) ≈ 4.6   atkMult(30) ≈ 3.2
  // hpMult(50) ≈ 7.6   atkMult(50) ≈ 4.7
  // hpMult(100)≈ 16.9  atkMult(100)≈ 9.0
  const hpMult  = 1 + Math.pow(f / 10, 1.15) * 1.0
  const atkMult = 1 + Math.pow(f / 10, 1.05) * 0.7
  const goldMult = 1 + Math.pow(f / 10, 0.85) * 0.6
  const xpMult  = 1 + Math.pow(f / 10, 0.9)  * 0.75

  return { hpMult, atkMult, goldMult, xpMult }
}

// ── Mutators ─────────────────────────────────────────────────────────────────

export interface MutatorDef {
  id: string
  name: string
  description: string
  /** Apply to player+mobs before battle tick starts. Pure transform. */
  apply: (input: { playerAtk: number; playerDef: number; mobs: MobDef[] }) => {
    playerAtk: number
    playerDef: number
    mobs: MobDef[]
  }
}

const MUTATORS: MutatorDef[] = [
  {
    id: 'brittle_bones',
    name: 'Brittle Bones',
    description: 'All mobs have -50% DEF, but +1 to their wave size next floor',
    apply: ({ playerAtk, playerDef, mobs }) => ({
      playerAtk,
      playerDef,
      mobs: mobs.map((m) => ({ ...m, def: Math.floor((m.def ?? 0) * 0.5) })),
    }),
  },
  {
    id: 'glass_cannons',
    name: 'Glass Cannons',
    description: 'Mobs have 30% HP but +40% ATK',
    apply: ({ playerAtk, playerDef, mobs }) => ({
      playerAtk,
      playerDef,
      mobs: mobs.map((m) => ({ ...m, hp: Math.ceil(m.hp * 0.3), atk: m.atk * 1.4 })),
    }),
  },
  {
    id: 'swarm',
    name: 'Swarm',
    description: 'Mobs have 60% HP but wave has +1 mob',
    apply: ({ playerAtk, playerDef, mobs }) => ({
      playerAtk,
      playerDef,
      mobs: mobs.map((m) => ({ ...m, hp: Math.ceil(m.hp * 0.6) })),
      // Wave size +1 handled at generation time — this is just a flag for the generator
    }),
  },
  {
    id: 'vampiric',
    name: 'Vampiric Soil',
    description: 'Player +20% ATK, but mobs drain 1 HP/s extra (via -1 regen equivalent)',
    apply: ({ playerAtk, playerDef, mobs }) => ({
      playerAtk: playerAtk * 1.2,
      playerDef,
      mobs,
    }),
  },
  {
    id: 'fortified',
    name: 'Fortified',
    description: 'Mobs have +50% DEF and +25% HP',
    apply: ({ playerAtk, playerDef, mobs }) => ({
      playerAtk,
      playerDef,
      mobs: mobs.map((m) => ({ ...m, def: (m.def ?? 0) + 3, hp: Math.ceil(m.hp * 1.25) })),
    }),
  },
  {
    id: 'overwhelm',
    name: 'Overwhelm',
    description: 'Mobs deal +25% damage, but drop +50% gold',
    apply: ({ playerAtk, playerDef, mobs }) => ({
      playerAtk,
      playerDef,
      mobs: mobs.map((m) => ({
        ...m,
        atk: m.atk * 1.25,
        goldMin: Math.ceil(m.goldMin * 1.5),
        goldMax: Math.ceil(m.goldMax * 1.5),
      })),
    }),
  },
]

export function getMutatorById(id: string): MutatorDef | null {
  return MUTATORS.find((m) => m.id === id) ?? null
}

/**
 * Returns a mutator for this floor, or null if the floor is below threshold.
 * Deterministic by (floor, runSeed). Mutators apply on every 5th floor from floor 15.
 */
export function getFloorMutator(floor: number, runSeed: number): MutatorDef | null {
  if (floor < MUTATOR_FLOOR_THRESHOLD) return null
  if (floor % 5 !== 0) return null
  const rng = mulberry32(runSeed ^ floor)
  const idx = Math.floor(rng() * MUTATORS.length)
  return MUTATORS[idx]
}

// ── Mob pool by biome ────────────────────────────────────────────────────────

/**
 * Delve pulls mob templates from existing arena zones for visual variety.
 * Floor band → zone range:
 *   1-20:   zones 1-3 (slime, goblin, wolf)
 *   21-50:  zones 3-5 (wolf, orc, troll)
 *   51-100: zones 5-7 (troll, dragon, lich)
 *   101+:   zones 7-8 (lich, titan) with max scaling
 */
function pickZonePool(floor: number): number[] {
  if (floor <= 20) return [0, 1, 2]
  if (floor <= 50) return [2, 3, 4]
  if (floor <= 100) return [4, 5, 6]
  return [6, 7]
}

function scaleMob(mob: MobDef, scaling: DepthScaling, mutation: number): MobDef {
  return {
    ...mob,
    id: `${mob.id}_dv${mutation}`,
    hp: Math.ceil(mob.hp * scaling.hpMult),
    atk: mob.atk * scaling.atkMult,
    goldMin: Math.ceil(mob.goldMin * scaling.goldMult),
    goldMax: Math.ceil(mob.goldMax * scaling.goldMult),
    xpReward: Math.ceil(mob.xpReward * scaling.xpMult),
  }
}

function scaleBoss(boss: BossDef, scaling: DepthScaling, floor: number): BossDef {
  // Boss is a gate but not a brick wall — tuned down from 1.5 after floor-10
  // wipes in top gear. Combined with gentler scaling this keeps bosses ~1.3x
  // a regular mob of that floor, plus the reward multiplier still earns it.
  const bossMult = 1.3
  return {
    ...boss,
    id: `${boss.id}_dv${floor}`,
    hp: Math.ceil(boss.hp * scaling.hpMult * bossMult),
    atk: boss.atk * scaling.atkMult * bossMult,
  }
}

// ── Main floor generator ─────────────────────────────────────────────────────

export interface DelveFloorSpec {
  floor: number
  kind: FloorKind
  mobs: MobDef[]         // empty when kind === 'rest'
  boss: BossDef | null   // only when kind === 'boss'
  mutator: MutatorDef | null
  scaling: DepthScaling
  biomeZoneIds: number[]
}

export function generateFloor(floor: number, runSeed: number): DelveFloorSpec {
  const kind = getFloorKind(floor)
  const scaling = getDepthScaling(floor)
  const mutator = getFloorMutator(floor, runSeed)
  const biomeZoneIds = pickZonePool(floor)

  if (kind === 'rest' || kind === 'rubicon') {
    return { floor, kind, mobs: [], boss: null, mutator: null, scaling, biomeZoneIds }
  }

  const rng = mulberry32(runSeed ^ (floor * 31))

  if (kind === 'boss') {
    const zoneIdx = biomeZoneIds[Math.floor(rng() * biomeZoneIds.length)]
    const zone = ZONES[zoneIdx]
    const boss = scaleBoss(zone.boss, scaling, floor)
    return { floor, kind, mobs: [], boss, mutator, scaling, biomeZoneIds }
  }

  // Wave floor
  let waveSize = getWaveSize(floor)
  if (mutator?.id === 'swarm') waveSize = Math.min(MAX_ACTIVE_MOBS, waveSize + 1)

  const mobs: MobDef[] = []
  for (let i = 0; i < waveSize; i++) {
    const zoneIdx = biomeZoneIds[Math.floor(rng() * biomeZoneIds.length)]
    const zone = ZONES[zoneIdx]
    const mobTemplate = zone.mobs[Math.floor(rng() * zone.mobs.length)]
    mobs.push(scaleMob(mobTemplate, scaling, floor * 10 + i))
  }

  return { floor, kind, mobs, boss: null, mutator, scaling, biomeZoneIds }
}

// ── Warrior XP rewards ───────────────────────────────────────────────────────

/** Warrior XP granted for clearing a delve floor. Per CEO review: 5×floor casual, 15×floor HC. */
export function getFloorWarriorXP(floor: number, mode: 'casual' | 'hardcore'): number {
  const base = mode === 'hardcore' ? 15 : 5
  return Math.floor(base * floor)
}

/** Warrior XP granted for beating a boss floor. 200 × (floor/10). */
export function getBossWarriorXP(floor: number, mode: 'casual' | 'hardcore'): number {
  const mult = mode === 'hardcore' ? 3 : 1
  return Math.floor(200 * (floor / 10) * mult)
}
