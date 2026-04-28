/**
 * Wipes all user-scoped local state so the next account that signs in starts fresh.
 *
 * Why: signing out only clears the Supabase auth session — Zustand persisted stores,
 * localStorage game keys, and the SQLite database all survive. If a different user
 * signs in afterwards, useProfileSync reads the stale local data and pushes it up
 * to the new user's cloud profile, leaking the previous user's progress.
 *
 * This function clears:
 *  - localStorage keys with the `grindly_` prefix (game state, including persisted
 *    Zustand stores like grindly_inventory_state_v2, grindly_arena_state, etc.)
 *  - the SQLite tables that hold per-user data (sessions, skill_xp, achievements…)
 *
 * What survives (device-level preferences, not user-level state):
 *  - sound, shortcuts, window/notification prefs, feature flags, inventory UI mode,
 *    onboarding/tour completion, "remember me", nav customization.
 */

const KEEP_KEYS = new Set<string>([
  'grindly_remember_me',
  'grindly_sound_volume',
  'grindly_sound_muted',
  'grindly_shortcuts_enabled',
  'grindly_show_window_on_session_end',
  'grindly_auto_start_grind',
  'grindly_tour_done',
  'grindly_onboarding_done',
  'grindly_nav_customization',
  'grindly_social_tab',
  'grindly_notifications_enabled',
  'grindly_last_user_id',
])

const KEEP_PREFIXES = [
  'grindly_flag_',
  'grindly_notifications_',
]

function shouldKeep(key: string): boolean {
  if (KEEP_KEYS.has(key)) return true
  for (const p of KEEP_PREFIXES) if (key.startsWith(p)) return true
  return false
}

export async function purgeLocalUserData(): Promise<void> {
  let removedKeys: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k) continue
      if (k.startsWith('grindly_') && !shouldKeep(k)) removedKeys.push(k)
    }
    for (const k of removedKeys) localStorage.removeItem(k)
  } catch (err) {
    console.warn('[purgeLocalUserData] localStorage purge failed:', err)
  }
  console.log(`[purgeLocalUserData] cleared ${removedKeys.length} localStorage keys:`, removedKeys)

  try {
    if (window.electronAPI?.db?.wipeUserData) {
      await window.electronAPI.db.wipeUserData()
      console.log('[purgeLocalUserData] SQLite wipeUserData succeeded')
    } else {
      console.warn('[purgeLocalUserData] window.electronAPI.db.wipeUserData is undefined — old preload bundle?')
    }
  } catch (err) {
    console.warn('[purgeLocalUserData] SQLite wipe failed:', err)
  }
}
