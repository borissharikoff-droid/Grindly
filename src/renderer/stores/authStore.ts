import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { purgeLocalUserData } from '../services/localUserDataReset'

const LAST_USER_KEY = 'grindly_last_user_id'

function readLastUserId(): string | null {
  try { return typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_USER_KEY) : null } catch { return null }
}
function writeLastUserId(id: string | null) {
  try {
    if (typeof localStorage === 'undefined') return
    if (id) localStorage.setItem(LAST_USER_KEY, id)
    else localStorage.removeItem(LAST_USER_KEY)
  } catch { /* ignore */ }
}

interface AuthStore {
  user: User | null
  loading: boolean
  init: () => void
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, username?: string) => Promise<{ error: Error | null; needsEmailConfirm: boolean }>
  verifyEmailOtp: (email: string, token: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: true,

  init() {
    if (!supabase) {
      set({ loading: false })
      return
    }
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const rememberMe = typeof localStorage !== 'undefined' ? localStorage.getItem('grindly_remember_me') : null
      if (session?.user && rememberMe === 'false') {
        // Same-account sign-out on launch — do NOT purge (would destroy local-only history).
        await supabase!.auth.signOut()
        set({ user: null, loading: false })
        return
      }

      const newUser = session?.user ?? null
      const lastId = readLastUserId()

      // Account-switch detected on launch (e.g. signed in here as a different user
      // than last time). Wipe local state before any sync runs, then reload with
      // a clean slate so all Zustand stores re-hydrate empty.
      if (newUser && lastId && lastId !== newUser.id) {
        console.log(`[authStore] account-switch on launch: ${lastId} → ${newUser.id}`)
        await purgeLocalUserData()
        writeLastUserId(newUser.id)
        if (typeof window !== 'undefined') {
          window.location.reload()
          return
        }
      }

      if (newUser) writeLastUserId(newUser.id)
      set({ user: newUser, loading: false })
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUser = session?.user ?? null
      const lastId = readLastUserId()

      // A different user signed in without an explicit prior signOut. Suspend the
      // store (so useProfileSync sees no user and stops), then purge + reload.
      if (newUser && lastId && lastId !== newUser.id) {
        console.log(`[authStore] account-switch via auth event: ${lastId} → ${newUser.id}`)
        set({ user: null, loading: true })
        ;(async () => {
          await purgeLocalUserData()
          writeLastUserId(newUser.id)
          if (typeof window !== 'undefined') window.location.reload()
        })()
        return
      }

      if (newUser) writeLastUserId(newUser.id)
      set({ user: newUser })
    })
    // Store for cleanup (best-effort; Electron renderer lives for the full app lifetime)
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => subscription.unsubscribe(), { once: true })
    }
  },

  async signIn(email: string, password: string) {
    if (!supabase) return { error: new Error('Supabase not configured') }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ?? null }
  },

  async signUp(email: string, password: string, username?: string) {
    if (!supabase) return { error: new Error('Supabase not configured'), needsEmailConfirm: false }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    })
    return { error: error ?? null, needsEmailConfirm: !error && !data.session }
  },

  async verifyEmailOtp(email: string, token: string) {
    if (!supabase) return { error: new Error('Supabase not configured') }
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' })
    return { error: error ?? null }
  },

  async signOut() {
    // IMPORTANT: do NOT purge local data here. Sessions, activities, and other
    // local-only state would be lost forever (they aren't synced to cloud, so
    // signing back into the SAME account couldn't restore them). The purge only
    // runs in init/onAuthStateChange when a *different* user_id is detected —
    // that's the case where keeping the old user's data leaks across accounts.
    // grindly_last_user_id is intentionally preserved so the account-switch
    // detection still fires on the next sign-in.
    if (supabase) {
      try { await supabase.auth.signOut() } catch { /* ignore */ }
    }
    set({ user: null })
  },
}))
