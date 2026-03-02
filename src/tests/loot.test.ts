import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LOOT_ITEMS,
  getEquippedPerkRuntime,
  openChest,
  rollChestDrop,
  estimateLootDropRate,
} from '../renderer/lib/loot'

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

describe('loot system', () => {
  beforeEach(() => {
    if (!('localStorage' in globalThis)) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: createMemoryStorage(),
        configurable: true,
      })
    }
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('rolls chest and opens to item', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01)
    const chestRoll = rollChestDrop(
      { source: 'skill_grind', focusCategory: 'coding' },
      { rollsSinceEpicChest: 0, rollsSinceRareChest: 0, rollsSinceLegendaryChest: 0 },
    )
    expect(chestRoll.chestType).toBeTruthy()
    const open = openChest(chestRoll.chestType, { source: 'session_complete' })
    expect(open?.item.id).toBeTruthy()
  })

  it('calculates runtime perks from equipped slots', () => {
    const perk = getEquippedPerkRuntime({
      top: 'grind_hoodie',
      accessory: 'geek_glasses',
      aura: 'pulse_aura',
    })
    expect(perk.skillXpMultiplierBySkill.developer).toBeGreaterThan(1)
    expect(perk.chestDropChanceBonusByCategory.coding).toBeGreaterThan(0)
    expect(perk.statusTitle).toBe('Pulse Wielder')
  })

  it('boosts Geek Glasses estimated drop on coding focus', () => {
    const base = estimateLootDropRate('geek_glasses', { source: 'skill_grind', focusCategory: 'other' })
    const boosted = estimateLootDropRate('geek_glasses', { source: 'goal_complete', focusCategory: 'coding' })
    expect(boosted).toBeGreaterThan(base)
  })

  it('registers 20 new loot V2 items with unique ids', () => {
    const newIds = [
      'paper_crown',
      'plain_tee',
      'worn_bracelet',
      'soft_glow',
      'canvas_cap',
      'sprint_cap',
      'task_vest',
      'code_wraps',
      'signal_pin',
      'study_halo',
      'sketch_hood',
      'chrono_visor',
      'pulse_coat',
      'sonic_loop',
      'teamlink_band',
      'aurora_field',
      'singularity_helm',
      'zero_day_jacket',
      'mythic_monocle',
      'eclipse_mantle',
    ]
    const allIds = LOOT_ITEMS.map((item) => item.id)
    expect(new Set(allIds).size).toBe(allIds.length)
    for (const id of newIds) {
      expect(allIds).toContain(id)
    }
  })

  it('applies representative V2 perks in runtime', () => {
    const perk = getEquippedPerkRuntime({
      head: 'chrono_visor',
      top: 'zero_day_jacket',
      accessory: 'mythic_monocle',
      aura: 'eclipse_mantle',
    })
    expect(perk.globalXpMultiplier).toBeGreaterThan(1)
    expect(perk.chestDropChanceBonusByCategory.coding).toBeGreaterThan(0)
    expect(perk.streakShield).toBe(true)
  })
})
