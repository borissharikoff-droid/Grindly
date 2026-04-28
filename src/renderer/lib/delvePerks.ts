/**
 * Delve in-run perk catalog.
 *
 * Perks are bought at Rubicon floors with run fragments. They apply ONLY for
 * the duration of the current run — extracted/dead, they're gone. Stacks
 * multiply (so two +20% ATK perks = 1.44x, not 1.40x).
 *
 * Effect surface:
 *   atkMult       — multiplier applied to playerSnapshot.atk
 *   hpMult        — multiplier applied to playerSnapshot.hp
 *   regenAdd      — flat add to playerSnapshot.hpRegen
 *   defAdd        — flat add to playerSnapshot.def
 *   lifestealPct  — % of player damage healed back (applied in combat tick — TODO when needed)
 *   fragmentsMult — multiplier on fragment drops for the rest of the run
 *   goldMult      — multiplier on gold drops for the rest of the run
 *
 * Perks listed here are the *test pool*. We surface 3 random per Rubicon.
 */

export type DelvePerkRarity = 'common' | 'rare' | 'epic'

export interface DelvePerkEffect {
  atkMult?: number
  hpMult?: number
  regenAdd?: number
  defAdd?: number
  lifestealPct?: number
  fragmentsMult?: number
  goldMult?: number
}

export interface DelvePerkDef {
  id: string
  name: string
  icon: string
  /** Optional PNG asset path (relative to renderer assets root) */
  image?: string
  rarity: DelvePerkRarity
  /** Cost in run fragments. Scales loosely with rarity. */
  cost: number
  description: string
  effect: DelvePerkEffect
}

export const DELVE_PERKS: DelvePerkDef[] = [
  // Power
  { id: 'edge_minor',     name: 'Whetstone',        icon: '⚔️', image: 'perks/edge_minor.png',   rarity: 'common', cost: 8,  description: '+15% ATK for the rest of the run.',                effect: { atkMult: 1.15 } },
  { id: 'edge_major',     name: 'Berserker Oil',    icon: '🩸', image: 'perks/edge_major.png',   rarity: 'rare',   cost: 24, description: '+30% ATK. The Abyss tastes blood.',                effect: { atkMult: 1.30 } },
  { id: 'edge_extreme',   name: 'Voidsteel Edge',   icon: '🗡️', image: 'perks/edge_extreme.png', rarity: 'epic',   cost: 60, description: '+50% ATK. You are the predator now.',              effect: { atkMult: 1.50 } },

  // Survival
  { id: 'hp_minor',       name: 'Iron Skin',        icon: '🛡️', image: 'perks/hp_minor.png',     rarity: 'common', cost: 8,  description: '+20% max HP.',                                      effect: { hpMult: 1.20 } },
  { id: 'regen_minor',    name: 'Mending Salve',    icon: '💚', image: 'perks/regen_minor.png',  rarity: 'common', cost: 10, description: '+3 HP regen per second.',                          effect: { regenAdd: 3 } },
  { id: 'def_minor',      name: 'Plated Greaves',   icon: '🦿', image: 'perks/def_minor.png',    rarity: 'common', cost: 8,  description: '+5 DEF.',                                          effect: { defAdd: 5 } },
  { id: 'lifesteal',      name: 'Bloodbound Rune',  icon: '🩸', image: 'perks/lifesteal.png',    rarity: 'rare',   cost: 30, description: '5% of damage dealt heals you.',                    effect: { lifestealPct: 0.05 } },

  // Eco
  { id: 'frag_boost',     name: 'Shard Lure',       icon: '✨', image: 'perks/frag_boost.png',   rarity: 'rare',   cost: 20, description: '+50% fragment drops for the rest of the run.',     effect: { fragmentsMult: 1.5 } },
  { id: 'gold_boost',     name: 'Greedy Eyes',      icon: '🪙', image: 'perks/gold_boost.png',   rarity: 'common', cost: 10, description: '+50% gold drops for the rest of the run.',         effect: { goldMult: 1.5 } },

  // Hybrid
  { id: 'predator',       name: 'Predator',         icon: '🐺', image: 'perks/predator.png',     rarity: 'rare',   cost: 26, description: '+15% ATK and +15% HP.',                            effect: { atkMult: 1.15, hpMult: 1.15 } },
  { id: 'survivor',       name: 'Survivor',         icon: '🌿', image: 'perks/survivor.png',     rarity: 'common', cost: 12, description: '+10% HP and +2 regen.',                            effect: { hpMult: 1.10, regenAdd: 2 } },
  { id: 'reckless',       name: 'Reckless Pact',    icon: '⚡', image: 'perks/reckless.png',     rarity: 'epic',   cost: 48, description: '+40% ATK but −20% max HP. Risk and reward.',       effect: { atkMult: 1.4, hpMult: 0.8 } },
]

export function getPerkById(id: string): DelvePerkDef | null {
  return DELVE_PERKS.find((p) => p.id === id) ?? null
}

/**
 * Pick N perks for a Rubicon offer. Deterministic by (runSeed, floor).
 * Avoids duplicates with already-owned perks where possible.
 *
 * Anti-feel-bad rule: if `availableFragments` is supplied, the first slot is
 * guaranteed to be an *affordable* common (so the player always has at least
 * one obvious "take it" option, especially at the first Rubicon).
 */
export function pickRubiconOffers(
  count: number,
  runSeed: number,
  floor: number,
  ownedPerkIds: string[],
  availableFragments?: number,
): DelvePerkDef[] {
  const seed = (runSeed ^ (floor * 73)) >>> 0
  let s = seed | 0
  const rng = () => {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const owned = new Set(ownedPerkIds)
  const pool = DELVE_PERKS.filter((p) => !owned.has(p.id))
  const fallback = DELVE_PERKS.slice()
  const usePool = pool.length >= count ? pool : fallback

  const picks: DelvePerkDef[] = []
  const usedIds = new Set<string>()

  // Slot 1: guaranteed affordable common, if budget known.
  if (availableFragments !== undefined && availableFragments > 0) {
    const affordableCommons = usePool.filter((p) => p.rarity === 'common' && p.cost <= availableFragments)
    if (affordableCommons.length > 0) {
      const guaranteed = affordableCommons[Math.floor(rng() * affordableCommons.length)]
      picks.push(guaranteed)
      usedIds.add(guaranteed.id)
    }
  }

  // Remaining slots: random from pool, no duplicates.
  let safety = 0
  while (picks.length < count && safety < 200) {
    safety++
    const candidate = usePool[Math.floor(rng() * usePool.length)]
    if (usedIds.has(candidate.id)) continue
    picks.push(candidate)
    usedIds.add(candidate.id)
  }
  return picks
}

/**
 * Apply all owned perks to a base CombatStats snapshot.
 * Returns a new snapshot — does not mutate input.
 *
 * Multipliers stack multiplicatively; flat adds stack additively.
 */
export interface CombatStatsLike {
  atk: number
  hp: number
  hpRegen: number
  def: number
}

export function applyPerksToStats<T extends CombatStatsLike>(base: T, perkIds: string[]): T {
  let atkMult = 1, hpMult = 1, regenAdd = 0, defAdd = 0
  for (const pid of perkIds) {
    const p = getPerkById(pid)
    if (!p) continue
    if (p.effect.atkMult)  atkMult *= p.effect.atkMult
    if (p.effect.hpMult)   hpMult  *= p.effect.hpMult
    if (p.effect.regenAdd) regenAdd += p.effect.regenAdd
    if (p.effect.defAdd)   defAdd   += p.effect.defAdd
  }
  return {
    ...base,
    atk: base.atk * atkMult,
    hp: Math.ceil(base.hp * hpMult),
    hpRegen: base.hpRegen + regenAdd,
    def: base.def + defAdd,
  }
}

/** Aggregate eco-side multipliers across owned perks (gold/fragments). */
export function aggregateRunMultipliers(perkIds: string[]): { goldMult: number; fragmentsMult: number; lifestealPct: number } {
  let goldMult = 1, fragmentsMult = 1, lifestealPct = 0
  for (const pid of perkIds) {
    const p = getPerkById(pid)
    if (!p) continue
    if (p.effect.goldMult)      goldMult      *= p.effect.goldMult
    if (p.effect.fragmentsMult) fragmentsMult *= p.effect.fragmentsMult
    if (p.effect.lifestealPct)  lifestealPct  += p.effect.lifestealPct
  }
  return { goldMult, fragmentsMult, lifestealPct }
}
