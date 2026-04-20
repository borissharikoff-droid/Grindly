import { beforeEach, describe, expect, it, vi } from 'vitest'

// Install memory localStorage BEFORE module imports so the rehydration IIFE
// (runs once at module load) sees the polyfill.
if (!('localStorage' in globalThis)) {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      get length() { return store.size },
      clear() { store.clear() },
      getItem(key: string) { return store.has(key) ? store.get(key)! : null },
      key(i: number) { return Array.from(store.keys())[i] ?? null },
      removeItem(key: string) { store.delete(key) },
      setItem(key: string, value: string) { store.set(key, String(value)) },
    },
    configurable: true,
  })
}

import { routeNotification } from '../renderer/services/notificationRouter'
import { useNotificationStore } from '../renderer/stores/notificationStore'

const PERSIST_KEY = 'grindly_notification_cooldowns'

describe('notificationRouter', () => {
  beforeEach(() => {
    useNotificationStore.getState().clear()
  })

  it('pushes progression events to in-app notifications', async () => {
    const ok = await routeNotification({
      type: 'progression_achievement',
      icon: '🏅',
      title: 'Achievement unlocked',
      body: 'Test achievement',
      dedupeKey: 'test:achievement',
    }, null)
    expect(ok).toBe(true)
    expect(useNotificationStore.getState().items.length).toBe(1)
    expect(useNotificationStore.getState().items[0].type).toBe('progression')
  })

  it('dedupes repeated events inside cooldown', async () => {
    await routeNotification({
      type: 'progression_info',
      icon: '🔔',
      title: 'Info',
      body: 'Body',
      dedupeKey: 'test:dedupe',
    }, null)
    const second = await routeNotification({
      type: 'progression_info',
      icon: '🔔',
      title: 'Info',
      body: 'Body',
      dedupeKey: 'test:dedupe',
    }, null)
    expect(second).toBe(false)
    expect(useNotificationStore.getState().items.length).toBe(1)
  })
})

// Regression: rehydration from localStorage should restore unexpired cooldowns
// so a fresh app start doesn't re-fire a toast the user just dismissed.
describe('notificationRouter — persisted cooldown rehydration', () => {
  beforeEach(() => {
    useNotificationStore.getState().clear()
    localStorage.removeItem(PERSIST_KEY)
    vi.resetModules()
  })

  it('rehydrates fresh cooldown and dedupes on next call', async () => {
    const now = Date.now()
    localStorage.setItem(PERSIST_KEY, JSON.stringify({ 'regression:fresh': now - 1_000 }))
    const mod = await import('../renderer/services/notificationRouter')
    const result = await mod.routeNotification({
      type: 'progression_info',
      icon: '🔔',
      title: 'Fresh',
      body: 'Body',
      dedupeKey: 'regression:fresh',
    }, null)
    expect(result).toBe(false)
    expect(useNotificationStore.getState().items.length).toBe(0)
  })

  it('drops stale cooldowns past max cooldown on rehydrate', async () => {
    // max cooldown is 120s (update). Entry 10 min old must be dropped.
    const now = Date.now()
    localStorage.setItem(PERSIST_KEY, JSON.stringify({ 'regression:stale': now - 600_000 }))
    const mod = await import('../renderer/services/notificationRouter')
    // Re-import notificationStore too — vi.resetModules gave us a fresh module graph.
    const storeMod = await import('../renderer/stores/notificationStore')
    const result = await mod.routeNotification({
      type: 'progression_info',
      icon: '🔔',
      title: 'Stale',
      body: 'Body',
      dedupeKey: 'regression:stale',
    }, null)
    expect(result).toBe(true)
    expect(storeMod.useNotificationStore.getState().items.length).toBe(1)
  })

  it('starts clean when localStorage has no persisted entry', async () => {
    const mod = await import('../renderer/services/notificationRouter')
    const result = await mod.routeNotification({
      type: 'progression_info',
      icon: '🔔',
      title: 'Clean',
      body: 'Body',
      dedupeKey: 'regression:clean',
    }, null)
    expect(result).toBe(true)
  })

  it('survives malformed persisted JSON without throwing', async () => {
    localStorage.setItem(PERSIST_KEY, 'not-valid-json{{{')
    const mod = await import('../renderer/services/notificationRouter')
    const result = await mod.routeNotification({
      type: 'progression_info',
      icon: '🔔',
      title: 'Malformed',
      body: 'Body',
      dedupeKey: 'regression:malformed',
    }, null)
    expect(result).toBe(true)
  })
})
