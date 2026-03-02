import { supabase } from './supabase'
import { useAuthStore } from '../stores/authStore'

const APP_VERSION = '1.0.0'

/**
 * Fire-and-forget analytics event.
 * No-ops silently if the user is not logged in.
 */
export function track(event: string, properties: Record<string, unknown> = {}): void {
  const user = useAuthStore.getState().user
  if (!user) return
  supabase
    .from('analytics_events')
    .insert({ user_id: user.id, event_name: event, properties, app_version: APP_VERSION })
    .then(() => {})
    .catch(() => {})
}
