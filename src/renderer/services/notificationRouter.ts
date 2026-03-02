import { useNotificationStore, type NotificationType } from '../stores/notificationStore'

export type RoutedNotificationEventType =
  | 'progression_level_up'
  | 'progression_achievement'
  | 'progression_info'
  | 'friend_levelup'
  | 'update'

export interface RoutedNotificationEvent {
  type: RoutedNotificationEventType
  icon: string
  title: string
  body: string
  dedupeKey: string
  desktop?: boolean
}

const COOLDOWNS_MS: Record<RoutedNotificationEventType, number> = {
  progression_level_up: 20_000,
  progression_achievement: 30_000,
  progression_info: 60_000,
  friend_levelup: 30_000,
  update: 120_000,
}

const lastSentByKey = new Map<string, number>()

function mapTypeForPanel(type: RoutedNotificationEventType): NotificationType {
  if (type === 'friend_levelup') return 'friend_levelup'
  if (type === 'update') return 'update'
  return 'progression'
}

export async function routeNotification(
  event: RoutedNotificationEvent,
  api: Window['electronAPI'] | null,
): Promise<boolean> {
  const now = Date.now()
  const cooldown = COOLDOWNS_MS[event.type] ?? 30_000
  const prev = lastSentByKey.get(event.dedupeKey) ?? 0
  if (now - prev < cooldown) return false
  lastSentByKey.set(event.dedupeKey, now)

  useNotificationStore.getState().push({
    type: mapTypeForPanel(event.type),
    icon: event.icon,
    title: event.title,
    body: event.body,
  })

  const globalEnabled = typeof localStorage !== 'undefined'
    ? localStorage.getItem('grindly_notifications_enabled') !== 'false'
    : true
  if (event.desktop && globalEnabled && api?.notify?.show) {
    await api.notify.show(event.title, event.body)
  }
  return true
}
