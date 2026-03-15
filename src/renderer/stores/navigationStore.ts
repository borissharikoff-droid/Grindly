import { create } from 'zustand'
import type { TabId } from '../App'

interface NavigationStore {
  /** Set by App.tsx — components can call this to navigate globally */
  navigateTo: ((tab: TabId) => void) | null
  setNavigateTo: (fn: (tab: TabId) => void) => void
  currentTab: TabId
  setCurrentTab: (tab: TabId) => void
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  navigateTo: null,
  setNavigateTo: (fn) => set({ navigateTo: fn }),
  currentTab: 'home',
  setCurrentTab: (tab) => set({ currentTab: tab }),
}))
