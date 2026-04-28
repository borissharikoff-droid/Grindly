/**
 * Permanent Delve meta-upgrades — bought once with banked fragments at the
 * Abyssal Cache, persist across all future Delve runs.
 *
 * These are the long-tail engine: every upgrade tangibly improves your next
 * descent without affecting the rest of the game (Delve-only buffs).
 */

import type { CombatStatsLike } from './delvePerks'

export type MetaUpgradeTrack = 'stat' | 'run' | 'survival'

export interface MetaUpgradeDef {
  id: string
  name: string
  icon: string
  track: MetaUpgradeTrack
  description: string
  /** Cost per rank — index 0 is rank 1, index 1 is rank 2, etc. */
  costs: number[]
  /** Effect deltas per rank — index 0 = effect at rank 1. */
  perRank: MetaUpgradeRankEffect[]
}

export interface MetaUpgradeRankEffect {
  /** Display string for the effect this rank grants. */
  label: string
}

export const META_UPGRADES: MetaUpgradeDef[] = [
  {
    id: 'meta_edge',
    name: 'Edge',
    icon: '⚔️',
    track: 'stat',
    description: 'Permanent ATK bonus inside Delve.',
    costs: [50, 120, 280, 600, 1200],
    perRank: [
      { label: '+4% ATK' },
      { label: '+8% ATK' },
      { label: '+12% ATK' },
      { label: '+16% ATK' },
      { label: '+20% ATK' },
    ],
  },
  {
    id: 'meta_conditioning',
    name: 'Conditioning',
    icon: '🛡️',
    track: 'stat',
    description: 'Permanent max HP bonus inside Delve.',
    costs: [50, 120, 280, 600, 1200],
    perRank: [
      { label: '+4% HP' },
      { label: '+8% HP' },
      { label: '+12% HP' },
      { label: '+16% HP' },
      { label: '+20% HP' },
    ],
  },
  {
    id: 'meta_bloodline',
    name: 'Bloodline',
    icon: '💚',
    track: 'survival',
    description: 'Bonus HP regen per second inside Delve.',
    costs: [60, 140, 320, 700, 1400],
    perRank: [
      { label: '+2 regen' },
      { label: '+4 regen' },
      { label: '+6 regen' },
      { label: '+9 regen' },
      { label: '+12 regen' },
    ],
  },
  {
    id: 'meta_vault',
    name: 'Vault',
    icon: '💎',
    track: 'run',
    description: 'Start every run with a fragment stipend.',
    costs: [80, 200, 500, 1000, 2000],
    perRank: [
      { label: 'Start +25 fragments' },
      { label: 'Start +50 fragments' },
      { label: 'Start +100 fragments' },
      { label: 'Start +200 fragments' },
      { label: 'Start +500 fragments' },
    ],
  },
  {
    id: 'meta_deep_pockets',
    name: 'Deep Pockets',
    icon: '🎒',
    track: 'run',
    description: 'Run inventory capacity grows.',
    costs: [80, 200, 450, 900, 1800],
    perRank: [
      { label: 'Cap 64 → 72' },
      { label: 'Cap 72 → 80' },
      { label: 'Cap 80 → 88' },
      { label: 'Cap 88 → 96' },
      { label: 'Cap 96 → 110' },
    ],
  },
  {
    id: 'meta_crossroads',
    name: 'Crossroads',
    icon: '🔀',
    track: 'run',
    description: 'Rubicon stops show more perk options.',
    costs: [120, 300, 700, 1500, 3000],
    perRank: [
      { label: 'Rubicon shows 4 perks' },
      { label: 'Rubicon shows 5 perks' },
      { label: 'Rubicon offers 2 picks of 5' },
      { label: 'Rubicon offers 2 picks of 6' },
      { label: 'Rubicon offers 3 picks of 6' },
    ],
  },
]

export function getMetaUpgradeById(id: string): MetaUpgradeDef | null {
  return META_UPGRADES.find((m) => m.id === id) ?? null
}

/** Get the next rank cost for an upgrade (rank 1..5). Returns null if maxed. */
export function getNextRankCost(id: string, currentRank: number): number | null {
  const def = getMetaUpgradeById(id)
  if (!def) return null
  if (currentRank >= def.costs.length) return null
  return def.costs[currentRank]
}

/** Compute aggregate stat multipliers from all owned meta-upgrades. */
export function applyMetaUpgradesToStats<T extends CombatStatsLike>(
  base: T,
  ranks: Record<string, number>,
): T {
  const edgeRank = ranks['meta_edge'] ?? 0
  const condRank = ranks['meta_conditioning'] ?? 0
  const bloodRank = ranks['meta_bloodline'] ?? 0

  const atkMult = 1 + edgeRank * 0.04
  const hpMult = 1 + condRank * 0.04
  const bloodlinePerRank = [0, 2, 4, 6, 9, 12]
  const regenAdd = bloodlinePerRank[bloodRank] ?? 0

  return {
    ...base,
    atk: base.atk * atkMult,
    hp: Math.ceil(base.hp * hpMult),
    hpRegen: base.hpRegen + regenAdd,
  }
}

/** Compute starting fragment stipend from Vault rank. */
export function getStartingFragments(ranks: Record<string, number>): number {
  const rank = ranks['meta_vault'] ?? 0
  if (rank <= 0) return 0
  const stipends = [25, 50, 100, 200, 500]
  return stipends[rank - 1] ?? 0
}

/** Compute effective run inventory cap from Deep Pockets rank. */
export function getRunInventoryCap(ranks: Record<string, number>): number {
  const rank = ranks['meta_deep_pockets'] ?? 0
  const caps = [64, 72, 80, 88, 96, 110]
  return caps[rank] ?? 64
}

/** Compute Rubicon offer count + pick count from Crossroads rank. */
export function getRubiconOfferConfig(ranks: Record<string, number>): { offers: number; picks: number } {
  const rank = ranks['meta_crossroads'] ?? 0
  switch (rank) {
    case 0: return { offers: 3, picks: 1 }
    case 1: return { offers: 4, picks: 1 }
    case 2: return { offers: 5, picks: 1 }
    case 3: return { offers: 5, picks: 2 }
    case 4: return { offers: 6, picks: 2 }
    case 5: return { offers: 6, picks: 3 }
    default: return { offers: 3, picks: 1 }
  }
}
