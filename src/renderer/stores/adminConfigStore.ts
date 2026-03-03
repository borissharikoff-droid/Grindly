import { create } from 'zustand'

/**
 * Incremented whenever admin config is re-applied from Supabase.
 * Components that render boss/item data subscribe to `rev` so they
 * re-render automatically when the admin updates skins, avatars, etc.
 */
interface AdminConfigStore {
  rev: number
  bump: () => void
}

export const useAdminConfigStore = create<AdminConfigStore>((set) => ({
  rev: 0,
  bump: () => set((s) => ({ rev: s.rev + 1 })),
}))
