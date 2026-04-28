/**
 * Fragment drop curve.
 *
 * Fragments are the Delve-only currency. They drop on floor clears (per cleared
 * floor — not per individual mob, to keep the loop crisp at the wave level).
 *
 * Drop ranges:
 *   wave  floor  → ~0.4 * floor + small jitter
 *   boss  floor  → 5 * (floor / 10) + jitter — substantial bonus
 *   rest  floor  → flat +5 fragments (a small "rest gift")
 *
 * HC mode multiplies by 1.5x (the "earned through pain" tax flip).
 *
 * Result is rounded to nearest integer with a minimum of 1 on any wave clear.
 */

export type FloorKindForFragments = 'wave' | 'boss' | 'rest' | 'rubicon'

export interface FragmentDropContext {
  floor: number
  kind: FloorKindForFragments
  mode: 'casual' | 'hardcore'
  /** Multiplier from active in-run perks (Shard Lure etc.). 1 if none. */
  fragmentsMult?: number
}

export function rollFloorFragments(ctx: FragmentDropContext): number {
  const modeMult = ctx.mode === 'hardcore' ? 1.5 : 1
  const perkMult = ctx.fragmentsMult ?? 1

  let base = 0
  if (ctx.kind === 'wave') {
    // Tuned for first-beacon affordability: by sector 5 a casual run banks
    // ~12-16 frags, enough to buy any common (cheapest = 8) reliably.
    base = 0.6 * ctx.floor + 1 + Math.random() * 2
  } else if (ctx.kind === 'boss') {
    base = 6 * Math.max(1, Math.floor(ctx.floor / 10)) + Math.random() * 8
  } else if (ctx.kind === 'rest') {
    base = 6
  } else {
    // rubicon — no fragment drop on the rubicon floor itself (it's a shop, not a fight)
    return 0
  }

  const total = Math.round(base * modeMult * perkMult)
  if (ctx.kind === 'wave') return Math.max(1, total)
  return total
}
