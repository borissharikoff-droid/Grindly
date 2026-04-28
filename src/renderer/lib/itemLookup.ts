/**
 * Universal item resolver — looks up an item ID across every catalog the game
 * uses (loot gear, farm seeds, plants, seed-zips, chests, food). Returns a
 * normalized display object so call sites don't have to know which catalog
 * the ID came from.
 *
 * Use this anywhere you have a raw `inv.items` ID and need to render it.
 */

import { LOOT_ITEMS, CHEST_DEFS, type LootRarity } from './loot'
import { getFarmItemDisplay } from './farming'
import { FOOD_ITEM_MAP } from './cooking'

export interface ResolvedItemDisplay {
  id: string
  name: string
  icon: string
  image?: string
  rarity: LootRarity
  /** Loose category — useful for filters in pickers. */
  kind: 'gear' | 'food' | 'plant' | 'material' | 'chest' | 'consumable' | 'other'
}

const GEAR_SLOTS = new Set(['head', 'body', 'legs', 'ring', 'weapon'])

export function resolveItemDisplay(itemId: string): ResolvedItemDisplay {
  const loot = LOOT_ITEMS.find((x) => x.id === itemId)
  if (loot) {
    let kind: ResolvedItemDisplay['kind'] = 'other'
    if (GEAR_SLOTS.has(loot.slot)) kind = 'gear'
    else if (loot.slot === 'food') kind = 'food'
    else if (loot.slot === 'plant') kind = 'plant'
    else if (loot.slot === 'material') kind = 'material'
    else if (loot.slot === 'consumable') kind = 'consumable'
    return {
      id: itemId,
      name: loot.name,
      icon: loot.icon || '📦',
      image: loot.image,
      rarity: loot.rarity,
      kind,
    }
  }

  const farm = getFarmItemDisplay(itemId)
  if (farm) {
    return {
      id: itemId,
      name: farm.name,
      icon: farm.icon || '🌱',
      image: farm.image,
      rarity: farm.rarity,
      kind: 'plant',
    }
  }

  const food = FOOD_ITEM_MAP[itemId]
  if (food) {
    return {
      id: itemId,
      name: food.name,
      icon: food.icon || '🍳',
      image: undefined,
      rarity: 'common',
      kind: 'food',
    }
  }

  const chest = CHEST_DEFS[itemId as keyof typeof CHEST_DEFS]
  if (chest) {
    return {
      id: itemId,
      name: chest.name,
      icon: chest.icon || '🎁',
      image: chest.image,
      rarity: chest.rarity,
      kind: 'chest',
    }
  }

  // Last resort — display the raw ID with a placeholder
  return {
    id: itemId,
    name: itemId,
    icon: '📦',
    image: undefined,
    rarity: 'common',
    kind: 'other',
  }
}
