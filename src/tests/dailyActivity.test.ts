import { beforeEach, describe, expect, it } from 'vitest'
import {
  claimDailyActivity,
  getDailyActivities,
  recordDeveloperXp,
  recordFocusSeconds,
  recordSessionWithoutAfk,
  recordDungeonComplete,
  recordHarvest,
  recordCraftComplete,
} from '../renderer/services/dailyActivityService'

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

describe('daily activity service', () => {
  beforeEach(() => {
    if (!('localStorage' in globalThis)) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: createMemoryStorage(),
        configurable: true,
      })
    }
    localStorage.clear()
  })

  it('tracks focus/developer progress and allows claiming', () => {
    recordFocusSeconds(50 * 60)
    recordDeveloperXp(1200)
    recordSessionWithoutAfk(true)
    recordDungeonComplete()
    recordHarvest(2)
    recordCraftComplete()
    const missions = getDailyActivities()
    expect(missions.every((m) => m.completed)).toBe(true)
    const chest = claimDailyActivity('focus_minutes')
    expect(chest).toBe('common_chest')
    const after = getDailyActivities().find((m) => m.id === 'focus_minutes')
    expect(after?.claimed).toBe(true)
  })
})
