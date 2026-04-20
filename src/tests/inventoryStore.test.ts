import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureInventoryHydrated, useInventoryStore } from '../renderer/stores/inventoryStore'

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
  }
}

describe('inventory store', () => {
  beforeEach(() => {
    if (!('localStorage' in globalThis)) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: createMemoryStorage(),
        configurable: true,
      })
    }
    localStorage.clear()
    useInventoryStore.setState({
      items: {},
      chests: { common_chest: 0, rare_chest: 0, epic_chest: 0, legendary_chest: 0 },
      equippedBySlot: {},
      pendingRewards: [],
      pity: { rollsSinceRareChest: 0, rollsSinceEpicChest: 0 },
      lastSkillDropAt: 0,
    })
    ensureInventoryHydrated()
  })

  it('queues pending reward then claims into chest inventory', () => {
    const store = useInventoryStore.getState()
    store.addChest('common_chest', 'session_complete', 10)
    const reward = useInventoryStore.getState().pendingRewards[0]
    expect(reward).toBeTruthy()
    useInventoryStore.getState().claimPendingReward(reward.id)
    expect(useInventoryStore.getState().chests.common_chest).toBe(1)
  })

  it('opens chest, grants item and equips it', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01)
    useInventoryStore.setState((s) => ({ ...s, chests: { ...s.chests, common_chest: 1 } }))
    const opened = useInventoryStore.getState().openChestAndGrantItem('common_chest', { source: 'session_complete' })
    expect(opened?.itemId).toBeTruthy()
    useInventoryStore.getState().equipItem(opened!.itemId)
    const equippedAny = Object.values(useInventoryStore.getState().equippedBySlot).some((id) => id === opened!.itemId)
    expect(equippedAny).toBe(true)
  })

  // Regression: cloud sync must preserve the 0-key tombstone so mergeFromCloud
  // can't restore an item the user just consumed/sold/deleted locally.
  it('syncItemsFromCloud preserves 0-qty tombstones (does not delete key)', () => {
    useInventoryStore.setState((s) => ({ ...s, items: { ...s.items, atk_potion: 3 } }))
    // User consumes all 3 locally → deleteItem leaves key with value 0
    useInventoryStore.getState().deleteItem('atk_potion', 3)
    expect(useInventoryStore.getState().items.atk_potion).toBe(0)
    // Cloud sync comes in with stale quantity 3 for the same item
    useInventoryStore.getState().syncItemsFromCloud([{ item_id: 'atk_potion', quantity: 3 }])
    // Quantity is authoritative-set to cloud value (this is the force-set path)
    expect(useInventoryStore.getState().items.atk_potion).toBe(3)
  })

  it('syncItemsFromCloud with 0 quantity keeps key as 0 (not undefined)', () => {
    useInventoryStore.setState((s) => ({ ...s, items: { ...s.items, hp_potion: 5 } }))
    useInventoryStore.getState().syncItemsFromCloud([{ item_id: 'hp_potion', quantity: 0 }])
    const items = useInventoryStore.getState().items
    expect('hp_potion' in items).toBe(true)
    expect(items.hp_potion).toBe(0)
  })

  it('mergeFromCloud respects local 0-key tombstone (cannot restore consumed items)', () => {
    useInventoryStore.setState((s) => ({ ...s, items: { ...s.items, regen_potion: 2 } }))
    useInventoryStore.getState().deleteItem('regen_potion', 2)
    expect(useInventoryStore.getState().items.regen_potion).toBe(0)
    // Stale cloud tries to restore
    useInventoryStore.getState().mergeFromCloud(
      { regen_potion: 2 },
      { common_chest: 0, rare_chest: 0, epic_chest: 0, legendary_chest: 0 },
    )
    // 0-key tombstone blocks the restore
    expect(useInventoryStore.getState().items.regen_potion).toBe(0)
  })
})
