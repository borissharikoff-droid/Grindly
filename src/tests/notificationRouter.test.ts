import { beforeEach, describe, expect, it } from 'vitest'
import { routeNotification } from '../renderer/services/notificationRouter'
import { useNotificationStore } from '../renderer/stores/notificationStore'

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

  it('does NOT cross-block events of different types sharing a dedupe key', async () => {
    // Regression: dedup key used to be shared across types, so a progression_info
    // inside its cooldown would also block an unrelated friend_levelup that
    // happened to supply the same raw dedupeKey. After fix 8, keys are
    // namespaced by event.type.
    const first = await routeNotification({
      type: 'progression_info',
      icon: '🔔',
      title: 'Info',
      body: 'Body',
      dedupeKey: 'shared-key',
    }, null)
    expect(first).toBe(true)

    const friendSame = await routeNotification({
      type: 'friend_levelup',
      icon: '⭐',
      title: 'Friend level up',
      body: 'Alice hit 10',
      dedupeKey: 'shared-key',
    }, null)
    expect(friendSame).toBe(true)
    expect(useNotificationStore.getState().items.length).toBe(2)
  })
})
