import { create } from 'zustand'
import type { FriendProfile } from '../hooks/useFriends'

export interface TradeItem {
  item_id: string
  qty: number
}

export type TradeStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired' | 'completed'

export interface TradeOffer {
  id: string
  initiator_id: string
  recipient_id: string
  initiator_items: TradeItem[]
  recipient_items: TradeItem[]
  initiator_gold: number
  recipient_gold: number
  status: TradeStatus
  message: string | null
  expires_at: string
  created_at: string
  /** Populated client-side after fetch */
  initiator_username?: string | null
  initiator_avatar?: string | null
  recipient_username?: string | null
  recipient_avatar?: string | null
}

type ModalState =
  | { mode: 'closed' }
  | { mode: 'create'; recipient: FriendProfile }
  | { mode: 'review'; offer: TradeOffer; initiatorProfile?: FriendProfile }
  | { mode: 'result'; received: TradeItem[]; goldReceived: number }

interface TradeState {
  /** Active incoming offer we haven't acted on yet (shown as banner) */
  incomingOffer: TradeOffer | null
  /** Offer we sent that's still pending */
  outgoingOffer: TradeOffer | null
  modalState: ModalState
  /** Full list of incoming pending offers (managed by useTradeNotifier + FriendsPage) */
  incomingOffers: TradeOffer[]
  /** Full list of outgoing pending offers */
  outgoingOffers: TradeOffer[]
  /** Session-history: recently accepted offers (cleared on reload) */
  acceptedOffers: TradeOffer[]
  /** Full trade history loaded from Supabase */
  tradeHistory: TradeOffer[]
  openCreate: (recipient: FriendProfile) => void
  openReview: (offer: TradeOffer, initiatorProfile?: FriendProfile) => void
  openResult: (received: TradeItem[], goldReceived: number) => void
  closeModal: () => void
  setIncomingOffer: (offer: TradeOffer | null) => void
  setOutgoingOffer: (offer: TradeOffer | null) => void
  setIncomingOffers: (offers: TradeOffer[]) => void
  addIncomingOffer: (offer: TradeOffer) => void
  removeIncomingOffer: (id: string) => void
  setOutgoingOffers: (offers: TradeOffer[]) => void
  removeOutgoingOffer: (id: string) => void
  addAcceptedOffer: (offer: TradeOffer) => void
  setTradeHistory: (h: TradeOffer[]) => void
}

export const useTradeStore = create<TradeState>((set) => ({
  incomingOffer: null,
  outgoingOffer: null,
  modalState: { mode: 'closed' },
  incomingOffers: [],
  outgoingOffers: [],
  acceptedOffers: [],
  tradeHistory: [],
  openCreate: (recipient) => set({ modalState: { mode: 'create', recipient } }),
  openReview: (offer, initiatorProfile) => set({ modalState: { mode: 'review', offer, initiatorProfile } }),
  openResult: (received, goldReceived) => set({ modalState: { mode: 'result', received, goldReceived } }),
  closeModal: () => set({ modalState: { mode: 'closed' } }),
  setIncomingOffer: (offer) => set({ incomingOffer: offer }),
  setOutgoingOffer: (offer) => set({ outgoingOffer: offer }),
  setIncomingOffers: (offers) => set({ incomingOffers: offers }),
  addIncomingOffer: (offer) =>
    set((s) => ({
      incomingOffers: s.incomingOffers.some((o) => o.id === offer.id)
        ? s.incomingOffers
        : [offer, ...s.incomingOffers],
    })),
  removeIncomingOffer: (id) =>
    set((s) => ({ incomingOffers: s.incomingOffers.filter((o) => o.id !== id) })),
  setOutgoingOffers: (offers) => set({ outgoingOffers: offers }),
  removeOutgoingOffer: (id) =>
    set((s) => ({ outgoingOffers: s.outgoingOffers.filter((o) => o.id !== id) })),
  addAcceptedOffer: (offer) =>
    set((s) => ({
      acceptedOffers: [{ ...offer, status: 'accepted' as TradeStatus }, ...s.acceptedOffers].slice(0, 20),
    })),
  setTradeHistory: (h) => set({ tradeHistory: h }),
}))
