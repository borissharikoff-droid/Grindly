/**
 * Delve cosmetic milestone registry.
 *
 * Cosmetic Abyss skins are visual overlays unlocked by reaching specific floor
 * milestones in HARDCORE mode only. They do NOT affect stats — pure prestige.
 * Skins become available in the Inventory equip UI as alternative visuals for
 * the matching slot.
 *
 * Visible to friends in FriendsPage via cosmeticsUnlocked[] on the profile.
 */

import type { LootSlot } from './loot'

/** Cosmetic visual layer — either mapped to a real gear slot (overlay on that slot's item),
 *  or `'cosmetic_aura'` which is a free-standing visual effect not tied to gear. */
export type CosmeticSlot = LootSlot | 'cosmetic_aura'

export interface DelveCosmeticDef {
  id: string
  name: string
  slot: CosmeticSlot
  floor: number              // minimum floor required (HC only)
  description: string
  /** Rarity percentile — how many players reach this. Surfaced in unlock modal. */
  rarityPct: number
  /** Optional image path — placeholder until QC MCP generation. */
  image?: string
}

export const DELVE_COSMETICS: DelveCosmeticDef[] = [
  {
    id: 'skin_abyss_cowl',
    name: 'Abyss Cowl',
    slot: 'head',
    floor: 10,
    description: 'A void-black hood, woven from shadows of the first descent.',
    rarityPct: 35,
  },
  {
    id: 'skin_abyss_robe',
    name: 'Abyss Robe',
    slot: 'body',
    floor: 25,
    description: 'Tattered robes that whisper of deeper dark.',
    rarityPct: 18,
  },
  {
    id: 'skin_abyss_sigil',
    name: 'Abyss Sigil',
    slot: 'ring',
    floor: 50,
    description: 'A glowing crimson mark burned into reality itself.',
    rarityPct: 7,
  },
  {
    id: 'skin_abyss_aura',
    name: 'Abyss Aura',
    slot: 'cosmetic_aura',
    floor: 75,
    description: 'Dark smoke trails you wherever you walk.',
    rarityPct: 3,
  },
  {
    id: 'skin_abyss_crown',
    name: 'Crown of the Abyss',
    slot: 'head',
    floor: 100,
    description: 'Only the mad wear this. Only the mad reach this.',
    rarityPct: 1.2,
  },
  {
    id: 'skin_void_wings',
    name: 'Void Wings',
    slot: 'cosmetic_aura',
    floor: 150,
    description: 'Wings of pure shadow. Others see them from across the map.',
    rarityPct: 0.5,
  },
  {
    id: 'skin_soul_eater',
    name: 'Soul Eater Robes',
    slot: 'body',
    floor: 250,
    description: 'They hunger. So do you.',
    rarityPct: 0.1,
  },
  {
    id: 'skin_abyss_sovereign',
    name: 'Sovereign of the Abyss',
    slot: 'cosmetic_aura',
    floor: 500,
    description: 'You are the thing that lives in the deep.',
    rarityPct: 0.01,
  },
]

/**
 * Check if crossing from oldFloor to newFloor in given mode unlocks any cosmetics.
 * Returns newly-unlocked cosmetic IDs (can be 0 or more).
 */
export function checkMilestoneUnlocks(
  oldFloor: number,
  newFloor: number,
  mode: 'casual' | 'hardcore',
): DelveCosmeticDef[] {
  if (mode !== 'hardcore') return []
  if (newFloor <= oldFloor) return []
  return DELVE_COSMETICS.filter((c) => c.floor > oldFloor && c.floor <= newFloor)
}

/** Get a cosmetic def by ID. */
export function getCosmeticById(id: string): DelveCosmeticDef | null {
  return DELVE_COSMETICS.find((c) => c.id === id) ?? null
}

/** Sorted list of upcoming milestones for display (floor > currentFloor). */
export function getUpcomingMilestones(currentFloor: number): DelveCosmeticDef[] {
  return DELVE_COSMETICS.filter((c) => c.floor > currentFloor).sort((a, b) => a.floor - b.floor)
}

/** Next milestone to display on DelvePage. Returns null if all unlocked. */
export function getNextMilestone(currentFloor: number): DelveCosmeticDef | null {
  const up = getUpcomingMilestones(currentFloor)
  return up[0] ?? null
}
