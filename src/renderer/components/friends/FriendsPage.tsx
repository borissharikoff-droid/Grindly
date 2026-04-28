import { useState, useCallback, useEffect } from 'react'
import { useEscapeHandler } from '../../hooks/useEscapeHandler'
import { motion } from 'framer-motion'
import { useChat } from '../../hooks/useChat'
import { useGroupChatList, useGroupChat, markGroupRead } from '../../hooks/useGroupChat'
import { FriendList } from './FriendList'
import { FriendListSkeleton } from './FriendListSkeleton'
import { AddFriend } from './AddFriend'
import { FriendProfile } from './FriendProfile'
import { PendingRequests } from './PendingRequests'
import { Leaderboard } from './Leaderboard'
import { GuildTab } from './GuildTab'
import { FriendCompare } from './FriendCompare'
import { ChatThread } from './ChatThread'
import { GroupChatThread } from './GroupChatThread'
import { GroupList } from './GroupList'
import { CreateGroupModal } from './CreateGroupModal'
import { PartyPanel } from './PartyPanel'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTradeStore, type TradeOffer } from '../../stores/tradeStore'
import { useInventoryStore } from '../../stores/inventoryStore'
import { useGoldStore } from '../../stores/goldStore'
import { TradeModal, TradeItemInspectPopup as TradeItemInspectPopupInline } from '../trade/TradeModal'
import { IncomingTradeBanner } from '../trade/IncomingTradeBanner'
import { useChatTargetStore } from '../../stores/chatTargetStore'
import { useRaidStore } from '../../stores/raidStore'
import { useNavigationStore } from '../../stores/navigationStore'
import type { FriendProfile as FriendProfileType, FriendsModel } from '../../hooks/useFriends'
import { syncSkillsToSupabase } from '../../services/supabaseSync'
import { useSkillSyncStore } from '../../stores/skillSyncStore'
import { PageHeader } from '../shared/PageHeader'
import { Users, Plus, UserPlus, Sword, Trophy, Shield } from '../../lib/icons'
import { BackButton } from '../shared/BackButton'
import { ErrorState } from '../shared/ErrorState'
import { EmptyState } from '../shared/EmptyState'
import { LOOT_ITEMS } from '../../lib/loot'
import { CRAFT_ITEM_MAP } from '../../lib/crafting'
import { LootVisual } from '../loot/LootUI'

const TRADE_RARITY_BORDER: Record<string, string> = {
  common: 'border-gray-500/40',
  rare: 'border-blue-500/40',
  epic: 'border-purple-500/40',
  legendary: 'border-amber-500/40',
  mythic: 'border-rose-500/40',
}

// ── Trades Tab ────────────────────────────────────────────────────────────────

function tradeExpiresStr(expiresAt: string): string {
  const sec = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  if (sec <= 0) return 'Expired'
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${Math.floor(sec / 3600)}h`
}

function isTradeExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now()
}

function TradeItemGrid({
  items,
  gold,
  onItemClick,
}: {
  items: TradeOffer['initiator_items']
  gold?: number
  onItemClick?: (itemId: string, qty: number) => void
}) {
  const hasItems = items.length > 0
  const hasGold = (gold ?? 0) > 0
  if (!hasItems && !hasGold) {
    return (
      <div className="flex items-center justify-center h-14 rounded border border-dashed border-white/[0.07]">
        <span className="text-[9px] text-gray-600">—</span>
      </div>
    )
  }
  const MAX = 4
  return (
    <div className="flex items-start gap-1.5 flex-wrap">
      {items.slice(0, MAX).map((t) => {
        const def = LOOT_ITEMS.find((i) => i.id === t.item_id) ?? CRAFT_ITEM_MAP[t.item_id]
        if (!def) return null
        const border = TRADE_RARITY_BORDER[def.rarity] ?? 'border-gray-500/40'
        return (
          <div
            key={t.item_id}
            title={def.name}
            className={`relative w-14 h-14 rounded border-2 ${border} bg-black/40 flex flex-col items-center justify-center shrink-0 transition-all ${onItemClick ? 'cursor-pointer hover:brightness-125' : ''}`}
            onClick={onItemClick ? () => onItemClick(t.item_id, t.qty) : undefined}
          >
            <LootVisual icon={def.icon} image={(def as { image?: string }).image}
              className="w-9 h-9 object-contain" scale={(def as { renderScale?: number }).renderScale ?? 1} />
            {t.qty > 1 && (
              <span className="absolute bottom-0.5 right-1 text-[9px] font-mono font-bold text-amber-300 leading-tight">
                ×{t.qty}
              </span>
            )}
          </div>
        )
      })}
      {items.length > MAX && (
        <div className="w-14 h-14 rounded border border-white/10 bg-white/[0.04] flex items-center justify-center shrink-0">
          <span className="text-[10px] text-gray-400 font-mono font-semibold">+{items.length - MAX}</span>
        </div>
      )}
      {hasGold && (
        <div className="flex flex-col items-center justify-center w-14 h-14 gap-0.5 rounded border border-amber-500/30 bg-amber-500/[0.06] shrink-0">
          <span className="text-base leading-none">🪙</span>
          <span className="text-[10px] font-mono font-bold text-amber-300 leading-tight">{gold}</span>
        </div>
      )}
    </div>
  )
}

function TradesTabSkeleton() {
  return (
    <div className="space-y-4 pt-1">
      {[1, 2].map((i) => (
        <div key={i} className="rounded border border-white/[0.07] overflow-hidden animate-pulse">
          <div className="px-2.5 py-2 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-white/10" />
              <div className="h-3 w-28 rounded bg-white/10" />
              <div className="ml-auto h-2.5 w-12 rounded bg-white/[0.06]" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1 h-14 rounded bg-white/[0.04]" />
              <div className="w-3 h-14 flex items-center justify-center" />
              <div className="flex-1 h-14 rounded bg-white/[0.04]" />
            </div>
            <div className="flex gap-1.5">
              <div className="flex-1 h-8 rounded bg-emerald-500/10" />
              <div className="flex-1 h-8 rounded bg-white/[0.06]" />
              <div className="w-16 h-8 rounded bg-white/[0.04]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function SectionHeader({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5 px-0.5 mb-1.5">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{label}</span>
      <span className="ml-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[8px] font-bold"
        style={{ background: `${color}22`, border: `1px solid ${color}44`, color }}>
        {count}
      </span>
    </div>
  )
}

function SwapArrow() {
  return (
    <svg className="w-3 h-3 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4M4 17h12M4 17l4-4M4 17l4 4" />
    </svg>
  )
}

function TradesTab({
  incoming,
  outgoing,
  history,
  friends,
  loading,
  cancellingId,
  myUserId,
  onCancel,
  onReview,
  onAccept,
  onDecline,
}: {
  incoming: TradeOffer[]
  outgoing: TradeOffer[]
  history: TradeOffer[]
  friends: FriendProfileType[]
  loading?: boolean
  cancellingId: string | null
  myUserId: string
  onCancel: (id: string) => void
  onReview: (offer: TradeOffer) => void
  onAccept: (offer: TradeOffer) => void
  onDecline: (offerId: string) => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [inspectItem, setInspectItem] = useState<{ id: string; qty: number } | null>(null)

  const handleAccept = async (offer: TradeOffer) => {
    if (busyId) return
    setBusyId(offer.id)
    await onAccept(offer)
    setBusyId(null)
  }

  const handleDecline = async (offerId: string) => {
    if (busyId) return
    setBusyId(offerId)
    await onDecline(offerId)
    setBusyId(null)
  }

  if (loading) return <TradesTabSkeleton />

  // Filter out expired offers (keep only truly pending)
  const activeIncoming = incoming.filter((o) => !isTradeExpired(o.expires_at))
  const activeOutgoing = outgoing.filter((o) => !isTradeExpired(o.expires_at))

  if (activeIncoming.length === 0 && activeOutgoing.length === 0 && history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-3">
        <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
          <span className="text-lg">⇄</span>
        </div>
        <div className="text-center">
          <p className="text-xs font-medium text-gray-400">No pending trades</p>
          <p className="text-[10px] text-gray-600 mt-0.5">Open a friend's profile to start a trade</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 pt-1">
      {/* Inspect popup */}
      {inspectItem && (
        <TradeItemInspectPopupInline
          itemId={inspectItem.id}
          qty={inspectItem.qty}
          onClose={() => setInspectItem(null)}
        />
      )}

      {/* ── Incoming ── */}
      {activeIncoming.length > 0 && (
        <div>
          <SectionHeader color="#34d399" label="Incoming" count={activeIncoming.length} />
          <div className="space-y-1.5">
            {activeIncoming.map((offer) => {
              const expiresLabel = tradeExpiresStr(offer.expires_at)
              const avatarChar = (offer.initiator_username || '?')[0].toUpperCase()
              const busy = busyId === offer.id
              return (
                <div key={offer.id}
                  className="rounded-lg border border-emerald-500/25 overflow-hidden"
                  style={{ background: 'rgba(16,185,129,0.035)' }}
                >
                  <div className="h-[2px] bg-gradient-to-r from-emerald-500/60 via-emerald-400/20 to-transparent" />

                  {/* Header: avatar + name + expiry + details button */}
                  <div className="px-3 pt-2.5 pb-0 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-emerald-900/60 border border-emerald-500/30 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold text-emerald-300">{avatarChar}</span>
                    </div>
                    <p className="text-xs font-semibold text-white leading-tight truncate flex-1">
                      {offer.initiator_username ?? 'Player'}
                    </p>
                    <span className="text-[9px] font-mono text-gray-600 shrink-0">{expiresLabel}</span>
                    <button
                      type="button"
                      onClick={() => onReview(offer)}
                      className="shrink-0 px-2 h-6 rounded text-[9px] font-mono text-gray-500 border border-white/[0.07] hover:text-gray-300 hover:border-white/15 transition-colors"
                      title="View details"
                    >···</button>
                  </div>

                  {/* Two equal columns via CSS grid */}
                  <div className="grid grid-cols-[1fr_20px_1fr] px-3 pt-2.5 pb-2">
                    <div>
                      <p className="text-[9px] font-semibold text-emerald-400/50 uppercase tracking-wider mb-2">They offer</p>
                      <TradeItemGrid
                        items={offer.initiator_items}
                        gold={offer.initiator_gold}
                        onItemClick={(id, qty) => setInspectItem({ id, qty })}
                      />
                    </div>
                    <div className="flex items-center justify-center pt-5">
                      <SwapArrow />
                    </div>
                    <div>
                      <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-2">You give</p>
                      <TradeItemGrid
                        items={offer.recipient_items}
                        gold={offer.recipient_gold}
                        onItemClick={(id, qty) => setInspectItem({ id, qty })}
                      />
                    </div>
                  </div>

                  {offer.message && (
                    <p className="text-[9px] text-gray-500 italic truncate px-3 pb-2 border-t border-white/[0.05] pt-1.5 -mt-0.5">
                      "{offer.message}"
                    </p>
                  )}

                  {/* Footer actions */}
                  <div className="border-t border-white/[0.05] px-3 py-2 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDecline(offer.id)}
                      className="flex-1 h-7 rounded border border-red-500/20 text-[10px] font-semibold text-red-500/60 hover:text-red-400 hover:border-red-500/35 hover:bg-red-500/[0.06] transition-colors disabled:opacity-30"
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleAccept(offer)}
                      className="flex-[2] h-7 rounded border border-emerald-500/40 bg-emerald-500/15 text-[10px] font-semibold text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {busy ? '…' : '✓ Accept'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Sent ── */}
      {activeOutgoing.length > 0 && (
        <div>
          <SectionHeader color="#6b7280" label="Sent" count={activeOutgoing.length} />
          <div className="space-y-1.5">
            {activeOutgoing.map((offer) => {
              const recipient = friends.find((f) => f.id === offer.recipient_id)
              const expiresLabel = tradeExpiresStr(offer.expires_at)
              const recipientChar = (recipient?.username || '?')[0].toUpperCase()
              return (
                <div key={offer.id}
                  className="rounded-lg border border-white/[0.08] overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.018)' }}
                >
                  {/* Header */}
                  <div className="px-3 pt-2.5 pb-0 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-white/[0.06] border border-white/[0.12] flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold text-gray-400">{recipientChar}</span>
                    </div>
                    <p className="text-xs font-semibold text-white leading-tight truncate flex-1">
                      To {recipient?.username ?? 'player'}
                    </p>
                    <span className="text-[9px] font-mono text-gray-600 shrink-0">{expiresLabel}</span>
                  </div>

                  {/* Two equal columns */}
                  <div className="grid grid-cols-[1fr_20px_1fr] px-3 pt-2.5 pb-2">
                    <div>
                      <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-2">You offer</p>
                      <TradeItemGrid
                        items={offer.initiator_items}
                        gold={offer.initiator_gold}
                        onItemClick={(id, qty) => setInspectItem({ id, qty })}
                      />
                    </div>
                    <div className="flex items-center justify-center pt-5">
                      <SwapArrow />
                    </div>
                    <div>
                      <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-2">You want</p>
                      <TradeItemGrid
                        items={offer.recipient_items}
                        gold={offer.recipient_gold}
                        onItemClick={(id, qty) => setInspectItem({ id, qty })}
                      />
                    </div>
                  </div>

                  {offer.message && (
                    <p className="text-[9px] text-gray-600 italic truncate px-3 pb-2 border-t border-white/[0.04] pt-1.5 -mt-0.5">
                      "{offer.message}"
                    </p>
                  )}

                  {/* Footer */}
                  <div className="border-t border-white/[0.05] px-3 py-2 flex items-center justify-end">
                    <button
                      type="button"
                      disabled={cancellingId === offer.id}
                      onClick={() => onCancel(offer.id)}
                      className="h-7 px-4 rounded border border-red-500/15 text-[10px] font-semibold text-red-500/50 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/[0.05] transition-colors disabled:opacity-30"
                    >
                      {cancellingId === offer.id ? '…' : 'Cancel offer'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── History ── */}
      {history.length > 0 && (
        <div>
          <SectionHeader color="#a78bfa" label="History" count={history.length} />
          <div className="space-y-1.5">
            {history.map((offer) => {
              const iAmInitiator = offer.initiator_id === myUserId
              const counterpartName = iAmInitiator
                ? (offer.recipient_username ?? 'Player')
                : (offer.initiator_username ?? 'Player')
              const counterpartChar = counterpartName[0].toUpperCase()
              // From my perspective: what I gave vs what I got
              const iGave = iAmInitiator
                ? { items: offer.initiator_items, gold: offer.initiator_gold }
                : { items: offer.recipient_items, gold: offer.recipient_gold }
              const iGot = iAmInitiator
                ? { items: offer.recipient_items, gold: offer.recipient_gold }
                : { items: offer.initiator_items, gold: offer.initiator_gold }
              const dateStr = new Date(offer.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              const timeStr = new Date(offer.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
              const statusColor = offer.status === 'accepted' ? '#34d399' : offer.status === 'declined' ? '#f87171' : '#9ca3af'
              const statusLabel = offer.status === 'accepted' ? '✓ accepted' : offer.status === 'declined' ? '✗ declined' : 'cancelled'
              return (
                <div key={offer.id}
                  className="rounded-lg border border-white/[0.07] overflow-hidden opacity-80"
                  style={{ background: 'rgba(167,139,250,0.025)' }}
                >
                  {/* Header */}
                  <div className="px-3 pt-2.5 pb-0 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-violet-900/40 border border-violet-500/20 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold text-violet-300">{counterpartChar}</span>
                    </div>
                    <p className="text-xs font-semibold text-gray-400 leading-tight truncate flex-1">
                      {counterpartName}
                    </p>
                    <span className="text-[9px] font-mono text-gray-600 shrink-0">{dateStr} {timeStr}</span>
                    <span className="text-[9px] font-mono shrink-0 ml-1" style={{ color: statusColor }}>{statusLabel}</span>
                  </div>
                  {/* Exchange */}
                  <div className="grid grid-cols-[1fr_20px_1fr] px-3 pt-2 pb-2.5">
                    <div>
                      <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Gave</p>
                      <TradeItemGrid items={iGave.items} gold={iGave.gold}
                        onItemClick={(id, qty) => setInspectItem({ id, qty })} />
                    </div>
                    <div className="flex items-center justify-center pt-4">
                      <SwapArrow />
                    </div>
                    <div>
                      <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Got</p>
                      <TradeItemGrid items={iGot.items} gold={iGot.gold}
                        onItemClick={(id, qty) => setInspectItem({ id, qty })} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

type FriendView = 'list' | 'profile' | 'compare' | 'chat' | 'group_chat'
type SocialTab = 'friends' | 'groups' | 'trades'

interface FriendsPageProps {
  friendsModel: FriendsModel
}

export function FriendsPage({ friendsModel }: FriendsPageProps) {
  const { user } = useAuthStore()
  const { friends, pendingRequests, unreadByFriendId, loading, error, refresh, acceptRequest, rejectRequest, removeFriend, clearUnreadForFriend } = friendsModel
  const [selected, setSelected] = useState<FriendProfileType | null>(null)
  const [view, setView] = useState<FriendView>('list')
  const [profileOriginView, setProfileOriginView] = useState<'chat' | 'group_chat' | null>(null)
  const [socialTab, setSocialTab] = useState<SocialTab>(() =>
    (localStorage.getItem('grindly_social_tab') as SocialTab) || 'friends'
  )
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [showGuild, setShowGuild] = useState(false)
  const [showParty, setShowParty] = useState(false)
  const [showAddFriend, setShowAddFriend] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  const setTab = useCallback((tab: SocialTab) => {
    setSocialTab(tab)
    localStorage.setItem('grindly_social_tab', tab)
  }, [])

  const fetchInvites = useRaidStore((s) => s.fetchInvites)
  const pendingFriendUserId = useNavigationStore((s) => s.pendingFriendUserId)
  const setPendingFriendUserId = useNavigationStore((s) => s.setPendingFriendUserId)
  const returnTab = useNavigationStore((s) => s.returnTab)
  const setReturnTab = useNavigationStore((s) => s.setReturnTab)
  const navTo = useNavigationStore((s) => s.navigateTo)
  const pendingTradesTab = useNavigationStore((s) => s.pendingTradesTab)
  const setPendingTradesTab = useNavigationStore((s) => s.setPendingTradesTab)

  // Auto-open friend profile when navigated here from another tab
  useEffect(() => {
    if (!pendingFriendUserId || !friends.length) return
    const friend = friends.find((f) => f.id === pendingFriendUserId)
    if (friend) {
      setPendingFriendUserId(null)
      setSelected(friend)
      setProfileOriginView(null)
      setView('profile')
    }
  }, [pendingFriendUserId, friends]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-switch to Trades sub-tab when notification navigates here
  useEffect(() => {
    if (!pendingTradesTab) return
    setPendingTradesTab(false)
    setTab('trades')
  }, [pendingTradesTab]) // eslint-disable-line react-hooks/exhaustive-deps

  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const groupList = useGroupChatList()
  const groupChat = useGroupChat(view === 'group_chat' ? activeGroupId : null)

  const peerId = view === 'chat' && selected ? selected.id : null
  const chat = useChat(peerId)
  const chatTargetFriendId = useChatTargetStore((s) => s.friendId)
  const setChatTargetFriendId = useChatTargetStore((s) => s.setFriendId)
  const setActiveChatPeerId = useChatTargetStore((s) => s.setActiveChatPeerId)

  useEffect(() => {
    setActiveChatPeerId(peerId)
    return () => setActiveChatPeerId(null)
  }, [peerId, setActiveChatPeerId])

  const { setSyncState } = useSkillSyncStore()

  const retrySkillSync = useCallback(async () => {
    const api = window.electronAPI
    if (!api?.db?.getAllSkillXP) return
    setSyncState({ status: 'syncing', error: null })
    const result = await syncSkillsToSupabase(api, { maxAttempts: 3 })
    if (result.ok) {
      setSyncState({ status: 'success', at: result.lastSkillSyncAt, error: null })
      refresh()
      return
    }
    setSyncState({ status: 'error', error: result.error ?? 'Skill sync failed' })
  }, [refresh, setSyncState])

  useEffect(() => {
    if (!selected) return
    const updated = friends.find((f) => f.id === selected.id)
    if (updated && updated !== selected) setSelected(updated)
  }, [friends]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!chatTargetFriendId) return
    const friend = friends.find((f) => f.id === chatTargetFriendId)
    setChatTargetFriendId(null)
    if (friend) { setSelected(friend); setView('chat') }
  }, [chatTargetFriendId, friends, setChatTargetFriendId])

  useEffect(() => { if (user) fetchInvites() }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Trade offers — read from global tradeStore (populated by useTradeNotifier) ──
  const incomingOffers = useTradeStore((s) => s.incomingOffers)
  const pendingOutgoing = useTradeStore((s) => s.outgoingOffers)
  const tradeHistory = useTradeStore((s) => s.tradeHistory)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [tradesLoading, setTradesLoading] = useState(true)
  const openTradeCreate = useTradeStore((s) => s.openCreate)

  const loadPendingTrades = useCallback(async () => {
    if (!supabase || !user) return
    const { data } = await supabase
      .from('trade_offers')
      .select('*')
      .eq('initiator_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    useTradeStore.getState().setOutgoingOffers((data as TradeOffer[] | null) ?? [])
  }, [user])

  const handleCancelTrade = useCallback(async (offerId: string) => {
    if (!supabase) return
    setCancellingId(offerId)
    const { data } = await supabase.rpc('cancel_trade_offer', { p_offer_id: offerId })
    setCancellingId(null)
    const result = data as { ok: boolean } | null
    if (result?.ok) {
      useTradeStore.getState().removeOutgoingOffer(offerId)
      if (user) {
        const { data: invData } = await supabase
          .from('user_inventory')
          .select('item_id, quantity')
          .eq('user_id', user.id)
          .gt('quantity', 0)
        if (invData) {
          useInventoryStore.getState().syncItemsFromCloud(invData.map((r) => ({ item_id: r.item_id, quantity: r.quantity })))
        }
      }
    }
  }, [user])

  const handleInlineAccept = useCallback(async (offer: TradeOffer) => {
    if (!supabase || !user) return
    const { data, error } = await supabase.rpc('accept_trade_offer', { p_offer_id: offer.id })
    const result = data as { ok: boolean; error?: string } | null
    if (error || !result?.ok) return
    useTradeStore.getState().removeIncomingOffer(offer.id)
    useTradeStore.getState().setIncomingOffer(null)
    useTradeStore.getState().addAcceptedOffer(offer)
    // Refresh balances
    const { data: invData } = await supabase.from('user_inventory').select('item_id, quantity').eq('user_id', user.id).gt('quantity', 0)
    if (invData) useInventoryStore.getState().syncItemsFromCloud(invData.map((r) => ({ item_id: r.item_id, quantity: r.quantity })))
    useGoldStore.getState().syncFromSupabase(user.id)
    // Open chest-style reveal
    useTradeStore.getState().openResult(offer.initiator_items, offer.initiator_gold ?? 0)
  }, [user])

  const handleInlineDecline = useCallback(async (offerId: string) => {
    if (!supabase) return
    const { data } = await supabase.rpc('decline_trade_offer', { p_offer_id: offerId })
    const result = data as { ok: boolean } | null
    if (result?.ok) {
      useTradeStore.getState().removeIncomingOffer(offerId)
      useTradeStore.getState().setIncomingOffer(null)
    }
  }, [])

  // Load initial trade data and populate the store
  const loadIncomingTrades = useCallback(async () => {
    if (!supabase || !user) return
    const { data } = await supabase
      .from('trade_offers')
      .select('*')
      .eq('recipient_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (!data || data.length === 0) { useTradeStore.getState().setIncomingOffers([]); return }
    const ids = [...new Set(data.map((o) => o.initiator_id))]
    const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url').in('id', ids)
    const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))
    useTradeStore.getState().setIncomingOffers(data.map((o) => ({
      ...(o as TradeOffer),
      initiator_username: profileMap[o.initiator_id]?.username ?? null,
      initiator_avatar: profileMap[o.initiator_id]?.avatar_url ?? null,
    })))
  }, [user])

  const loadTradeHistory = useCallback(async () => {
    if (!supabase || !user) return
    // Fetch last 30 completed trades where I was initiator or recipient
    const { data } = await supabase
      .from('trade_offers')
      .select('*')
      .or(`initiator_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .in('status', ['completed', 'accepted', 'declined', 'cancelled'])
      .order('created_at', { ascending: false })
      .limit(30)
    if (!data?.length) { useTradeStore.getState().setTradeHistory([]); return }

    // Collect all unique counterpart IDs
    const counterpartIds = [...new Set(data.map((o) =>
      o.initiator_id === user.id ? o.recipient_id : o.initiator_id
    ))]
    const { data: profiles } = await supabase
      .from('profiles').select('id, username, avatar_url').in('id', counterpartIds)
    const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))

    const enriched: TradeOffer[] = (data as TradeOffer[]).map((o) => ({
      ...o,
      initiator_username: profileMap[o.initiator_id]?.username ?? null,
      initiator_avatar: profileMap[o.initiator_id]?.avatar_url ?? null,
      recipient_username: profileMap[o.recipient_id]?.username ?? null,
      recipient_avatar: profileMap[o.recipient_id]?.avatar_url ?? null,
    }))
    useTradeStore.getState().setTradeHistory(enriched)
  }, [user])

  useEffect(() => {
    Promise.all([loadIncomingTrades(), loadPendingTrades(), loadTradeHistory()]).finally(() => setTradesLoading(false))
  }, [loadIncomingTrades, loadPendingTrades, loadTradeHistory])

  const markConversationReadAndRefresh = useCallback(async (otherUserId: string) => {
    // Clear unread badge optimistically so FriendList updates immediately
    clearUnreadForFriend(otherUserId)
    await chat.markConversationRead(otherUserId)
    refresh()
  }, [chat.markConversationRead, refresh, clearUnreadForFriend])

  const openGroup = useCallback((groupId: string) => {
    const group = groupList.groups.find((g) => g.id === groupId)
    if (group?.lastMessage) markGroupRead(groupId, group.lastMessage.created_at)
    groupList.markRead(groupId)
    setActiveGroupId(groupId)
    setView('group_chat')
  }, [groupList])

  const incomingCount = pendingRequests.filter((r) => r.direction === 'incoming').length
  const totalGroupUnread = groupList.groups.filter((g) => g.hasUnread).length

  const isSubview = view === 'chat' || view === 'profile' || view === 'compare' || view === 'group_chat'
    || showGuild || showLeaderboard || showParty || showAddFriend

  const backToList = useCallback(() => {
    setProfileOriginView(null)
    if (returnTab) {
      setReturnTab(null)
      setSelected(null)
      setActiveGroupId(null)
      setView('list')
      navTo?.(returnTab)
    } else {
      setView('list')
      setSelected(null)
      setActiveGroupId(null)
    }
  }, [returnTab, setReturnTab, navTo])

  const handleBack = useCallback(() => {
    if (showAddFriend) { setShowAddFriend(false) }
    else if (showParty) { setShowParty(false) }
    else if (showGuild) { setShowGuild(false) }
    else if (showLeaderboard) { setShowLeaderboard(false) }
    else if (view === 'compare') { setView('profile') }
    else if (view === 'profile' && profileOriginView) { const origin = profileOriginView; setProfileOriginView(null); setView(origin) }
    else { backToList() }
  }, [view, profileOriginView, backToList, showGuild, showLeaderboard, showAddFriend, showParty])

  useEscapeHandler(handleBack, isSubview)

  useEffect(() => {
    if (!isSubview) return
    const isEditableTarget = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null
      if (!el) return false
      const tag = el.tagName?.toLowerCase()
      return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
    }
    const isMouseBack = (button: number) => button === 3 || button === 4
    const onMouseBackCapture = (e: MouseEvent) => {
      if (!isMouseBack(e.button)) return
      if (isEditableTarget(e.target)) return
      e.preventDefault()
      e.stopPropagation()
      handleBack()
    }
    window.addEventListener('mousedown', onMouseBackCapture, true)
    window.addEventListener('auxclick', onMouseBackCapture, true)
    return () => {
      window.removeEventListener('mousedown', onMouseBackCapture, true)
      window.removeEventListener('auxclick', onMouseBackCapture, true)
    }
  }, [isSubview, handleBack])

  const isChatView = (view === 'chat' && selected) || view === 'group_chat'

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 1 }}
      transition={{ duration: 0 }}
      className={isChatView ? 'flex flex-col h-full min-h-0 p-2' : 'p-4 pb-20'}
    >
      <TradeModal />
      <IncomingTradeBanner />

      {showCreateGroup && (
        <CreateGroupModal
          friends={friends}
          onCreate={async (name, memberIds) => {
            const group = await groupList.createGroup(name, memberIds)
            if (group) { setTab('groups'); openGroup(group.id); setShowCreateGroup(false) }
          }}
          onClose={() => setShowCreateGroup(false)}
        />
      )}

      {!user ? (
        <EmptyState title="Sign in to join the squad" description="Add friends, flex your stats, and compete on the leaderboard." icon={<Users className="w-6 h-6 text-gray-500" />} />
      ) : !supabase ? (
        <EmptyState
          title="Supabase not configured"
          description="Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env in the project root and rebuild."
          icon="🔌"
        />
      ) : view === 'group_chat' && !groupChat.group ? (
        /* Loading skeleton while group data fetches — prevents flash back to list */
        <div className="flex flex-col h-full min-h-0 animate-pulse">
          <div className="flex items-center justify-center py-2.5 mb-1 shrink-0">
            <div className="h-6 w-32 rounded bg-white/5" />
          </div>
          <div className="flex-1 px-3 py-3 space-y-3">
            <div className="flex justify-start"><div className="h-10 w-40 rounded-xl bg-white/5" /></div>
            <div className="flex justify-end"><div className="h-8 w-28 rounded-xl bg-accent/5" /></div>
            <div className="flex justify-start"><div className="h-12 w-36 rounded-xl bg-white/5" /></div>
          </div>
        </div>
      ) : view === 'group_chat' && groupChat.group ? (
        <GroupChatThread
          group={groupChat.group}
          members={groupChat.members}
          messages={groupChat.messages}
          reactions={groupChat.reactions}
          friends={friends}
          loading={groupChat.loading}
          sending={groupChat.sending}
          sendError={groupChat.sendError}
          myId={user.id}
          initialMemberCount={groupList.groups.find((g) => g.id === activeGroupId)?.memberCount}
          initialOtherMember={groupList.groups.find((g) => g.id === activeGroupId)?.otherMember}
          onBack={() => { setActiveGroupId(null); setView('list') }}
          onMarkRead={() => { if (activeGroupId) groupList.markRead(activeGroupId) }}
          onOpenProfile={(userId) => {
            const friend = friends.find((f) => f.id === userId)
            if (friend) {
              setSelected(friend)
            } else {
              // Member is not a friend — build minimal profile from group member data
              const member = groupChat.members.find((m) => m.user_id === userId)
              if (!member) return
              setSelected({
                id: userId,
                username: member.username,
                avatar_url: member.avatar_url,
                equipped_frame: member.equipped_frame ?? null,
                level: 0, xp: 0, current_activity: null, is_online: false,
                streak_count: 0, friendship_id: '', friendship_status: 'none',
              })
            }
            setProfileOriginView('group_chat')
            setView('profile')
          }}
          sendMessage={groupChat.sendMessage}
          toggleReaction={groupChat.toggleReaction}
          addMember={groupChat.addMember}
          removeMember={groupChat.removeMember}
          renameGroup={async (name) => { const err = await groupChat.renameGroup(name); if (!err) groupList.refresh(); return err }}
          deleteGroup={async () => { await groupChat.deleteGroup(); groupList.refresh(); setActiveGroupId(null); setView('list') }}
          leaveGroup={async () => { await groupChat.leaveGroup(); groupList.refresh(); setActiveGroupId(null); setView('list') }}
        />
      ) : view === 'compare' && selected ? (
        <FriendCompare friend={selected} onBack={() => setView('profile')} />
      ) : view === 'chat' && selected ? (
        <ChatThread
          profile={selected}
          onBack={backToList}
          onOpenProfile={() => { setProfileOriginView('chat'); setView('profile') }}
          messages={chat.messages}
          reactions={chat.reactions}
          loading={chat.loading}
          loadingMore={chat.loadingMore}
          hasMoreMessages={chat.hasMoreMessages}
          sending={chat.sending}
          sendError={chat.sendError}
          getConversation={chat.getConversation}
          loadMoreMessages={chat.loadMoreMessages}
          sendMessage={chat.sendMessage}
          markConversationRead={markConversationReadAndRefresh}
          toggleReaction={chat.toggleReaction}
        />
      ) : view === 'profile' && selected ? (
        <FriendProfile
          profile={selected}
          onBack={profileOriginView ? () => { const origin = profileOriginView; setProfileOriginView(null); setView(origin) } : backToList}
          onCompare={selected.friendship_status !== 'none' ? () => setView('compare') : undefined}
          onMessage={selected.friendship_status !== 'none' ? () => setView('chat') : undefined}
          onTrade={selected.friendship_status !== 'none' ? () => openTradeCreate(selected) : undefined}
          onRemove={selected.friendship_status !== 'none' ? async () => {
            const ok = await removeFriend(selected.friendship_id)
            if (ok) { setSelected(null); setView('list') }
          } : undefined}
          onAddFriend={selected.friendship_status === 'none' && supabase && user ? async () => {
            await supabase.from('friendships').insert({ user_id: user.id, friend_id: selected.id, status: 'pending' })
            refresh()
          } : undefined}
        />
      ) : (
        <div className="space-y-3">
          {/* Header */}
          <PageHeader
            title="Social"
            icon={<Users className="w-4 h-4 text-indigo-400" />}
            rightSlot={(
              <div className="flex items-center gap-1">
                {/* Party / Leaderboard / Guild — visible icon buttons */}
                {[
                  { icon: <Sword className="w-3.5 h-3.5" />,  active: showParty,        color: 'text-violet-400', activeBg: 'bg-violet-500/15 border-violet-500/30',  onClick: () => { setShowParty((v) => !v); setShowLeaderboard(false); setShowGuild(false); setShowAddFriend(false) } },
                  { icon: <Trophy className="w-3.5 h-3.5" />, active: showLeaderboard,  color: 'text-amber-400',  activeBg: 'bg-amber-500/15 border-amber-500/30',    onClick: () => { setShowLeaderboard((v) => !v); setShowParty(false); setShowGuild(false); setShowAddFriend(false) } },
                  { icon: <Shield className="w-3.5 h-3.5" />, active: showGuild,        color: 'text-yellow-400', activeBg: 'bg-yellow-500/15 border-yellow-500/30',  onClick: () => { setShowGuild((v) => !v); setShowLeaderboard(false); setShowParty(false); setShowAddFriend(false) } },
                ].map((btn, i) => (
                  <button key={i} type="button" onClick={btn.onClick}
                    className={`w-7 h-7 rounded-full flex items-center justify-center border transition-colors ${
                      btn.active
                        ? `${btn.activeBg} ${btn.color}`
                        : 'bg-white/5 border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20'
                    }`}
                  >
                    {btn.icon}
                  </button>
                ))}

                {/* + dropdown: Add Friend / New Group */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setShowDropdown((v) => !v) }}
                    className={`w-7 h-7 rounded-full flex items-center justify-center border transition-all ${
                      showDropdown
                        ? 'bg-accent/20 border-accent/40 text-accent'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                    }`}
                    style={{ transform: showDropdown ? 'rotate(45deg)' : 'rotate(0deg)', transition: 'transform 0.2s, background 0.15s, color 0.15s' }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  {showDropdown && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
                      <div className="absolute right-0 top-full mt-2 z-20 w-40 rounded-card bg-surface-1 border border-white/[0.08] shadow-2xl overflow-hidden">
                        {[
                          { icon: <UserPlus className="w-3.5 h-3.5" />, label: 'Add Friend', color: 'text-accent',     onClick: () => { setShowAddFriend(true); setShowParty(false); setShowLeaderboard(false); setShowGuild(false) } },
                          { icon: <Users className="w-3.5 h-3.5" />,    label: 'New Group',  color: 'text-indigo-400', onClick: () => setShowCreateGroup(true) },
                        ].map((item) => (
                          <button key={item.label} type="button"
                            onClick={() => { item.onClick(); setShowDropdown(false) }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
                          >
                            <span className={item.color}>{item.icon}</span>
                            <span className="text-xs text-gray-200">{item.label}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          />

          {/* Add Friend panel */}
          {showAddFriend && (
            <div className="space-y-2">
              <BackButton onClick={() => setShowAddFriend(false)} />
              <AddFriend onAdded={() => { refresh(); setShowAddFriend(false) }} />
            </div>
          )}

          {/* Incoming requests */}
          {incomingCount > 0 && !showLeaderboard && !showGuild && !showParty && !showAddFriend && (
            <PendingRequests
              requests={pendingRequests.filter((r) => r.direction === 'incoming')}
              onAccept={acceptRequest}
              onReject={rejectRequest}
            />
          )}

          {/* Panel views: Party / Guild / Leaderboard */}
          {showParty ? (
            <div className="space-y-3">
              <BackButton onClick={() => setShowParty(false)} />
              <PartyPanel
                friends={friends}
                onClose={() => setShowParty(false)}
                onViewProfile={(f) => { setSelected(f); setProfileOriginView(null); setShowParty(false); setView('profile') }}
                onMessageFriend={(userId) => {
                  const f = friends.find((fr) => fr.id === userId)
                  if (f) { setSelected(f); setShowParty(false); setView('chat') }
                }}
              />
            </div>
          ) : showGuild ? (
            <div className="space-y-3">
              <BackButton onClick={() => setShowGuild(false)} />
              <GuildTab onSelectMember={(userId) => {
                const friend = friends.find((f) => f.id === userId)
                if (friend) { setSelected(friend); setProfileOriginView(null); setView('profile'); setShowGuild(false) }
              }} />
            </div>
          ) : showLeaderboard ? (
            <div className="space-y-3">
              <BackButton onClick={() => setShowLeaderboard(false)} />
              <Leaderboard onSelectUser={async (userId) => {
                const friend = friends.find((f) => f.id === userId)
                if (friend) {
                  setSelected(friend); setProfileOriginView(null); setView('profile'); setShowLeaderboard(false)
                  return
                }
                // Non-friend from leaderboard — fetch their profile and show it
                if (!supabase) return
                try {
                  const { data: p } = await supabase.from('profiles').select('*').eq('id', userId).single()
                  if (!p) return
                  setSelected({
                    id: p.id,
                    username: p.username,
                    avatar_url: p.avatar_url,
                    level: p.level ?? 0,
                    xp: p.xp ?? 0,
                    current_activity: p.current_activity ?? null,
                    is_online: p.is_online ?? false,
                    streak_count: p.streak_count ?? 0,
                    friendship_id: '',
                    friendship_status: 'none',
                    equipped_badges: p.equipped_badges ?? [],
                    equipped_frame: p.equipped_frame ?? null,
                    equipped_loot: p.equipped_loot ?? {},
                    persona_id: p.persona_id ?? null,
                    pet_snapshot: p.pet_snapshot ?? null,
                  })
                  setProfileOriginView(null)
                  setView('profile')
                  setShowLeaderboard(false)
                } catch { /* non-fatal */ }
              }} />
            </div>
          ) : !showAddFriend ? (
            <>
              {/* Friends | Trades | Groups tab bar */}
              <div className="flex border-b border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setTab('friends')}
                  className={`flex-1 text-xs font-medium py-2 transition-colors ${
                    socialTab === 'friends'
                      ? 'text-white border-b-2 border-accent -mb-px'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Friends
                </button>
                <button
                  type="button"
                  onClick={() => setTab('trades')}
                  className={`flex-1 text-xs font-medium py-2 transition-colors relative ${
                    socialTab === 'trades'
                      ? 'text-white border-b-2 border-emerald-400 -mb-px'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Trades
                  {incomingOffers.filter((o) => !isTradeExpired(o.expires_at)).length > 0 && (
                    <span className="inline-flex items-center justify-center w-3.5 h-3.5 bg-emerald-500 rounded-full ml-1 mb-0.5 align-middle text-[8px] font-bold text-white leading-none">
                      {incomingOffers.filter((o) => !isTradeExpired(o.expires_at)).length > 9 ? '9+' : incomingOffers.filter((o) => !isTradeExpired(o.expires_at)).length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setTab('groups')}
                  className={`flex-1 text-xs font-medium py-2 transition-colors relative ${
                    socialTab === 'groups'
                      ? 'text-white border-b-2 border-indigo-400 -mb-px'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Groups
                  {totalGroupUnread > 0 && (
                    <span className="inline-block w-1.5 h-1.5 bg-red-500 rounded-full ml-1 mb-0.5 align-middle" />
                  )}
                </button>
              </div>

              {/* Tab content */}
              {socialTab === 'friends' ? (
                <>
                  {error && (
                    <ErrorState message={error} onRetry={() => refresh()} retryLabel="Reconnect" secondaryAction={{ label: 'Retry sync', onClick: retrySkillSync }} className="mb-3" />
                  )}
                  {loading ? (
                    <FriendListSkeleton />
                  ) : (
                    <FriendList
                      friends={friends}
                      onSelectFriend={(f) => { setSelected(f); setProfileOriginView(null); setView('profile') }}
                      onMessageFriend={(f) => { setSelected(f); setView('chat') }}
                      onTradeFriend={(f) => openTradeCreate(f)}
                      unreadByFriendId={unreadByFriendId}
                    />
                  )}
                  {!loading && !error && friends.length === 0 && (
                    <EmptyState title="No squad yet" description="Add your first friend by username to compete and flex stats." icon="👾" />
                  )}
                  {!loading && pendingRequests.filter((r) => r.direction === 'outgoing').length > 0 && (
                    <div className="mt-3">
                      <PendingRequests
                        requests={pendingRequests.filter((r) => r.direction === 'outgoing')}
                        onAccept={acceptRequest}
                        onReject={rejectRequest}
                      />
                    </div>
                  )}
                </>
              ) : socialTab === 'trades' ? (
                <TradesTab
                  incoming={incomingOffers}
                  outgoing={pendingOutgoing}
                  history={tradeHistory}
                  friends={friends}
                  loading={tradesLoading}
                  cancellingId={cancellingId}
                  myUserId={user?.id ?? ''}
                  onCancel={handleCancelTrade}
                  onReview={(offer) => useTradeStore.getState().openReview(offer)}
                  onAccept={handleInlineAccept}
                  onDecline={handleInlineDecline}
                />
              ) : (
                <GroupList
                  groups={groupList.groups}
                  loading={groupList.loading}
                  myId={user.id}
                  onSelectGroup={openGroup}
                  onCreateGroup={() => setShowCreateGroup(true)}
                  onLeaveGroup={groupList.leaveGroup}
                  onDeleteGroup={groupList.deleteGroup}
                />
              )}
            </>
          ) : null}
        </div>
      )}
    </motion.div>
  )
}
