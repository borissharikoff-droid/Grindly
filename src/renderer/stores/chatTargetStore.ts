import { create } from 'zustand'

/**
 * When set, FriendsPage should navigate to chat with this friend.
 * Cleared after FriendsPage handles it.
 */
interface ChatTargetStore {
  friendId: string | null
  setFriendId: (id: string | null) => void
  /** ID of the friend we're currently chatting with (used to suppress new-message toasts) */
  activeChatPeerId: string | null
  setActiveChatPeerId: (id: string | null) => void
}

export const useChatTargetStore = create<ChatTargetStore>((set) => ({
  friendId: null,
  setFriendId: (id) => set({ friendId: id }),
  activeChatPeerId: null,
  setActiveChatPeerId: (id) => set({ activeChatPeerId: id }),
}))
