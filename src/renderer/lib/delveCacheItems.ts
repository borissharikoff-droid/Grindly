/**
 * Abyssal Cache — exclusive items only purchasable with banked fragments.
 *
 * One-time purchases. Once bought, the item is unlocked permanently and shows
 * as "OWNED" in the Cache. Test slice ships 2 items so the user can validate
 * the purchase + unlock + grant flow.
 *
 * Items granted to the player by adding to inventoryStore on purchase.
 */

export interface CacheItemDef {
  id: string
  name: string
  icon: string
  cost: number
  description: string
  /** What to grant on purchase. 'item' adds qty to inventory; 'cosmetic_unlock' just flips a flag. */
  grant:
    | { kind: 'item'; itemId: string; qty: number }
    | { kind: 'cosmetic_unlock'; cosmeticId: string }
}

export const CACHE_ITEMS: CacheItemDef[] = [
  {
    id: 'cache_voidshard_amulet',
    name: 'Voidshard Amulet',
    icon: '🔮',
    cost: 200,
    description: 'A shard of crystallized dark. +50% fragment drops while equipped (Delve only).',
    // For test slice: just give 1 ring item; effect wiring comes when item is added to LOOT_ITEMS proper.
    grant: { kind: 'item', itemId: 'voidshard_amulet', qty: 1 },
  },
  {
    id: 'cache_phoenix_tear',
    name: 'Phoenix Tear',
    icon: '🔥',
    cost: 300,
    description: 'A consumable. Once per run, revive at 25% HP if you would die.',
    grant: { kind: 'item', itemId: 'phoenix_tear', qty: 1 },
  },
]

export function getCacheItemById(id: string): CacheItemDef | null {
  return CACHE_ITEMS.find((c) => c.id === id) ?? null
}
