import { createClient, type User } from '@supabase/supabase-js'

// Env vars are baked in by Vite at build time. Hard-coded values are the
// fallback so the installer always has working credentials (anon key is public).
const SUPABASE_URL  = 'https://athiojjreuexcmziqbcn.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0aGlvampyZXVleGNtemlxYmNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MjU1NjksImV4cCI6MjA4NjAwMTU2OX0.VU8aWawpq5zA4y-RTpWGJN_5Gne6THcF2OZPg1RVIKs'

const url     = (import.meta.env.VITE_SUPABASE_URL     as string | undefined) || SUPABASE_URL
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || SUPABASE_ANON

export const supabase = createClient(url, anonKey)
export const isSupabaseConfigured = true

export interface Profile {
  id: string
  username: string | null
  avatar_url: string | null
  level: number
  xp: number
  current_activity: string | null
  is_online: boolean
  streak_count: number
  equipped_badges?: string[] | null
  equipped_frame?: string | null
  updated_at: string
}

export function useSupabase() {
  return { supabase, user: null as User | null }
}
