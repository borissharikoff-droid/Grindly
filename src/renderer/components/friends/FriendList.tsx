import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { MessageCircle, Users, User, Star, ArrowLeftRight } from '../../lib/icons'
import type { FriendProfile } from '../../hooks/useFriends'
import { getSkillByName, getSkillActivityLine, MAX_TOTAL_SKILL_LEVEL } from '../../lib/skills'
import { playClickSound } from '../../lib/sounds'
import { parseFriendPresence, formatSessionDurationCompact } from '../../lib/friendPresence'
import { AvatarWithFrame } from '../shared/AvatarWithFrame'
import { usePartyStore } from '../../stores/partyStore'
import { useToastStore } from '../../stores/toastStore'
import { motion, AnimatePresence } from 'framer-motion'
import { getPetLevelImage, getMoodRingColor } from '../../lib/pets'

const PINNED_STORAGE_KEY = 'grindly_pinned_friends'

function loadPinnedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(PINNED_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

function savePinnedIds(ids: Set<string>) {
  localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(Array.from(ids)))
}

function isSeenToday(iso: string | null | undefined): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  return Date.now() - d.getTime() < 24 * 60 * 60 * 1000
}

interface FriendListProps {
  friends: FriendProfile[]
  onSelectFriend: (profile: FriendProfile) => void
  onMessageFriend?: (profile: FriendProfile) => void
  onTradeFriend?: (profile: FriendProfile) => void
  unreadByFriendId?: Record<string, number>
}

export function FriendList({ friends, onSelectFriend, onMessageFriend, onTradeFriend, unreadByFriendId = {} }: FriendListProps) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; friend: FriendProfile } | null>(null)
  const [inviting, setInviting] = useState<string | null>(null)
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => loadPinnedIds())
  const [search, setSearch] = useState('')
  const ctxRef = useRef<HTMLDivElement>(null)
  const partyMembers = usePartyStore((s) => s.members)
  const sendInvite = usePartyStore((s) => s.sendInvite)
  const pushToast = useToastStore((s) => s.push)

  const togglePin = useCallback((id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      savePinnedIds(next)
      return next
    })
  }, [])

  useEffect(() => {
    if (!ctxMenu) return
    const close = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null)
    }
    const closeKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', closeKey)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', closeKey) }
  }, [ctxMenu])

  const handleInviteToParty = async (friendId: string) => {
    setCtxMenu(null)
    playClickSound()
    setInviting(friendId)
    const result = await sendInvite(friendId)
    setInviting(null)
    pushToast({ kind: 'generic', message: result.ok ? 'Party invite sent!' : (result.error ?? 'Invite failed'), type: result.ok ? 'success' : 'error' })
  }

  useEffect(() => {
    const hasLiveSessions = friends.some((f) => f.is_online && Boolean(parseFriendPresence(f.current_activity).sessionStartMs))
    if (!hasLiveSessions) return
    const t = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [friends])

  const formatLastSeen = (iso: string | null | undefined): string => {
    if (!iso) return 'Last seen: unknown'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return 'Last seen: unknown'
    const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
    return `Last seen: ${date}, ${time}`
  }

  // Filter by search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return friends
    return friends.filter((f) => (f.username ?? '').toLowerCase().includes(q))
  }, [friends, search])

  // Group into sections: pinned / online / seen today / offline
  const { pinned, online, seenToday, offline } = useMemo(() => {
    const pinned: FriendProfile[] = []
    const online: FriendProfile[] = []
    const seenToday: FriendProfile[] = []
    const offline: FriendProfile[] = []

    for (const f of filtered) {
      if (pinnedIds.has(f.id)) {
        pinned.push(f)
        continue
      }
      if (f.is_online) {
        online.push(f)
      } else if (isSeenToday(f.last_seen_at)) {
        seenToday.push(f)
      } else {
        offline.push(f)
      }
    }

    // Sort pinned: online first, then by last_seen
    pinned.sort((a, b) => {
      if (a.is_online !== b.is_online) return a.is_online ? -1 : 1
      return (b.total_skill_level ?? 0) - (a.total_skill_level ?? 0)
    })
    // Sort online: active > AFK
    online.sort((a, b) => {
      const rank = (f: FriendProfile) => f.current_activity === 'AFK' ? 1 : 0
      return rank(a) - rank(b)
    })
    // Sort seenToday / offline by last_seen desc
    const byLastSeen = (a: FriendProfile, b: FriendProfile) => {
      const ta = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0
      const tb = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0
      return tb - ta
    }
    seenToday.sort(byLastSeen)
    offline.sort(byLastSeen)

    return { pinned, online, seenToday, offline }
  }, [filtered, pinnedIds])

  const totalOnline = friends.filter((f) => f.is_online).length

  if (friends.length === 0) {
    // Empty state is rendered by the parent FriendsPage — avoid double panels.
    return null
  }

  const renderFriendCard = (f: FriendProfile) => {
    const { activityLabel, appName, sessionStartMs } = parseFriendPresence(f.current_activity ?? null)
    const isAfk = f.is_online && f.current_activity === 'AFK'
    const isLeveling = f.is_online && !isAfk && activityLabel.startsWith('Leveling ')
    const levelingSkill = isLeveling ? activityLabel.replace('Leveling ', '') : null
    const unread = unreadByFriendId[f.id] ?? 0
    const liveDuration = f.is_online && sessionStartMs ? formatSessionDurationCompact(sessionStartMs, nowMs) : null
    const hasSyncedSkills = f.skills_sync_status === 'synced'
    const totalSkillDisplay = hasSyncedSkills ? `${f.total_skill_level ?? 0}/${MAX_TOTAL_SKILL_LEVEL}` : '--/--'
    const isPinned = pinnedIds.has(f.id)

    return (
      <div
        key={f.id}
        onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, friend: f }) }}
        className={`w-full flex items-center gap-2 rounded border p-3 text-left transition-all ${
          isPinned
              ? 'border-amber-500/20 bg-amber-500/[0.04] hover:-translate-y-[1px]'
              : isAfk
                ? 'bg-surface-2/70 border-white/8 opacity-85 hover:opacity-95 hover:-translate-y-[1px]'
                : f.is_online
                  ? 'bg-surface-2/90 border-white/10 hover:border-white/20 hover:-translate-y-[1px]'
                  : 'bg-surface-2/50 border-white/5 opacity-70 hover:opacity-90 hover:-translate-y-[1px]'
        }`}
      >
        {/* Pin star — left anchor */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); togglePin(f.id) }}
          className={`shrink-0 p-1 rounded transition-colors ${isPinned ? 'text-amber-400 hover:text-amber-300' : 'text-gray-700 hover:text-gray-500 hover:bg-white/5'}`}
          title={isPinned ? 'Unpin' : 'Pin to top'}
        >
          <svg className="w-[13px] h-[13px]" viewBox="0 0 24 24" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
            <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
          </svg>
        </button>

        <button
          type="button"
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
          onClick={() => { playClickSound(); onSelectFriend(f) }}
        >
          {/* Avatar */}
          <div className="relative shrink-0 overflow-visible">
            <AvatarWithFrame
              avatar={f.avatar_url || '🤖'}
              frameId={f.equipped_frame}
              sizeClass="w-10 h-10"
              textClass="text-lg"
              roundedClass="rounded-full"
              ringInsetClass="-inset-0.5"
              ringOpacity={0.95}
              moodRingColor={f.pet_snapshot ? getMoodRingColor(f.pet_snapshot.hunger) : undefined}
            />
            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface-2 ${
              isAfk ? 'bg-yellow-400' : f.is_online ? 'bg-green-500' : 'bg-gray-600'
            }`} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-sm font-semibold text-white truncate">{f.username || 'Anonymous'}</span>
              {f.guild_tag && (
                <span className="text-micro px-1 py-[1px] rounded font-bold border border-amber-500/40 bg-amber-500/10 text-amber-400 shrink-0">
                  [{f.guild_tag}]
                </span>
              )}
              <span className="text-micro text-accent font-mono shrink-0" title={hasSyncedSkills ? 'Total skill level' : 'Skill sync pending'}>
                {totalSkillDisplay}
              </span>
              {f.streak_count > 0 && (
                <span className="text-micro text-orange-400 font-mono shrink-0" title="Streak">🔥{f.streak_count}d</span>
              )}
            </div>

            {/* Pet badge */}
            {f.pet_snapshot && (() => {
              const petImg = f.pet_snapshot.defId ? getPetLevelImage(f.pet_snapshot.defId, f.pet_snapshot.level) : null
              return (
                <div className="flex items-center gap-1 mb-0.5">
                  {petImg
                    ? <img src={petImg} alt="" className="w-5 h-5 object-contain shrink-0" draggable={false} />
                    : <span className="text-sm leading-none">{f.pet_snapshot.emoji}</span>}
                  <span className="text-micro font-mono text-gray-500 truncate">
                    {f.pet_snapshot.name} · Lvl {f.pet_snapshot.level}
                    {f.pet_snapshot.hunger < 25 && <span className="text-amber-500"> · hungry</span>}
                  </span>
                </div>
              )
            })()}

            {/* Status */}
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                {f.is_online ? (
                  isAfk ? (
                    <span className="text-caption text-yellow-400">AFK</span>
                  ) : isLeveling ? (() => {
                    const skill = getSkillByName(levelingSkill ?? '')
                    return (
                      <span className="text-caption text-gray-400 font-medium flex items-center gap-1.5">
                        {skill?.icon && <span className="text-sm">{skill.icon}</span>}
                        Leveling {levelingSkill}{liveDuration ? ` • ${liveDuration}` : ''}
                      </span>
                    )
                  })() : activityLabel ? (
                    <span className="text-caption text-blue-400 truncate">{activityLabel}</span>
                  ) : (
                    <span className="text-caption text-gray-400">Online</span>
                  )
                ) : (
                  <span className="text-caption text-gray-600">{formatLastSeen(f.last_seen_at)}</span>
                )}
              </div>
              {f.is_online && appName && (() => {
                const skill = levelingSkill ? getSkillByName(levelingSkill.split(' + ')[0].trim()) : null
                const activityLine = getSkillActivityLine(skill?.id ?? null, appName)
                return (
                  <span className="text-micro text-gray-500 truncate">
                    {activityLine}{liveDuration ? ` • ${liveDuration}` : ''}
                  </span>
                )
              })()}
            </div>
          </div>
        </button>

        {/* Message button — right side only */}
        {onMessageFriend && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMessageFriend(f) }}
            className="relative p-1.5 rounded text-gray-400 hover:text-accent hover:bg-white/5 transition-colors shrink-0"
            title="Message"
          >
            <MessageCircle className="w-[18px] h-[18px]" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 flex items-center justify-center rounded-full bg-red-500 text-micro font-bold text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
        )}
      </div>
    )
  }

  const SectionLabel = ({ label, count, dot }: { label: string; count: number; dot: string }) => (
    <div className="flex items-center gap-1.5 px-0.5 pt-1 pb-0.5">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      <span className="text-micro font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
      <span className="text-micro font-mono text-gray-600">{count}</span>
    </div>
  )

  const showSearch = friends.length > 6

  return (
    <div className="space-y-1">
      {/* Search */}
      {showSearch && (
        <div className="relative mb-2">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search friends..."
            className="w-full bg-surface-2/60 border border-white/[0.08] rounded px-2.5 pl-8 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-accent/40 transition-colors"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      )}

      {/* Online count chip */}
      {!showSearch && totalOnline > 0 && (
        <div className="flex items-center gap-1 px-0.5 pb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-micro text-gray-500">{totalOnline} online</span>
        </div>
      )}

      {/* No results */}
      {search && filtered.length === 0 && (
        <div className="py-6 text-center text-gray-600 text-xs">No friends matching "{search}"</div>
      )}

      {/* Pinned section */}
      {pinned.length > 0 && (
        <div className="space-y-1.5">
          <SectionLabel label="Pinned" count={pinned.length} dot="bg-amber-400" />
          {pinned.map(renderFriendCard)}
        </div>
      )}

      {/* Online section */}
      {online.length > 0 && (
        <div className="space-y-1.5">
          <SectionLabel label="Online" count={online.length} dot="bg-green-500" />
          {online.map(renderFriendCard)}
        </div>
      )}

      {/* Seen Today section */}
      {seenToday.length > 0 && (
        <div className="space-y-1.5">
          <SectionLabel label="Seen Today" count={seenToday.length} dot="bg-blue-400/70" />
          {seenToday.map(renderFriendCard)}
        </div>
      )}

      {/* Offline section */}
      {offline.length > 0 && (
        <div className="space-y-1.5">
          <SectionLabel label="Offline" count={offline.length} dot="bg-gray-600" />
          {offline.map(renderFriendCard)}
        </div>
      )}

      {/* Context menu */}
      <AnimatePresence>
        {ctxMenu && (() => {
          const f = ctxMenu.friend
          const alreadyInParty = partyMembers.some((m) => m.user_id === f.id)
          const canInvite = !alreadyInParty && partyMembers.length < 5
          const isPinned = pinnedIds.has(f.id)
          const menuW = 160
          const menuH = (onTradeFriend ? 25 : 0) + (canInvite ? 25 : 0) + 120
          const x = Math.min(ctxMenu.x, window.innerWidth - menuW - 8)
          const y = Math.min(ctxMenu.y, window.innerHeight - menuH - 8)
          return (
            <motion.div
              ref={ctxRef}
              key="friend-ctx"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.08 }}
              className="fixed z-[60] min-w-[152px] rounded-card bg-surface-0 border border-white/10 shadow-2xl overflow-hidden"
              style={{ top: y, left: x }}
            >
              <div className="px-2.5 py-1 border-b border-white/[0.06]">
                <p className="text-micro font-semibold text-gray-400 uppercase tracking-wider truncate">{f.username ?? 'Friend'}</p>
              </div>
              <button type="button" onClick={() => { setCtxMenu(null); playClickSound(); onSelectFriend(f) }}
                className="w-full text-left px-2.5 py-1.5 text-micro font-mono text-gray-300 hover:bg-white/[0.06] transition-colors flex items-center gap-2">
                <User className="w-3.5 h-3.5 shrink-0" />
                View profile
              </button>
              <button type="button" onClick={() => { setCtxMenu(null); togglePin(f.id) }}
                className="w-full text-left px-2.5 py-1.5 text-micro font-mono text-amber-300 hover:bg-amber-500/10 transition-colors flex items-center gap-2">
                <Star className="w-3.5 h-3.5 shrink-0" />
                {isPinned ? 'Unpin' : 'Pin to top'}
              </button>
              {onMessageFriend && (
                <button type="button" onClick={() => { setCtxMenu(null); playClickSound(); onMessageFriend(f) }}
                  className="w-full text-left px-2.5 py-1.5 text-micro font-mono text-indigo-300 hover:bg-indigo-500/10 transition-colors flex items-center gap-2">
                  <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                  Message
                </button>
              )}
              {onTradeFriend && (
                <button type="button" onClick={() => { setCtxMenu(null); playClickSound(); onTradeFriend(f) }}
                  className="w-full text-left px-2.5 py-1.5 text-micro font-mono text-emerald-300 hover:bg-emerald-500/10 transition-colors flex items-center gap-2">
                  <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
                  Trade
                </button>
              )}
              {canInvite && (
                <button type="button" disabled={inviting === f.id} onClick={() => handleInviteToParty(f.id)}
                  className="w-full text-left px-2.5 py-1.5 text-micro font-mono text-accent hover:bg-accent/10 transition-colors disabled:opacity-40 flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  {inviting === f.id ? 'Inviting...' : 'Invite to party'}
                </button>
              )}
            </motion.div>
          )
        })()}
      </AnimatePresence>
    </div>
  )
}
