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
})
