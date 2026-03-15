import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGuildStore } from '../../stores/guildStore'
import { useAuthStore } from '../../stores/authStore'
import { useGoldStore } from '../../stores/goldStore'
import { searchGuilds, fetchTopGuilds, type Guild } from '../../services/guildService'
import { playClickSound } from '../../lib/sounds'
import { useToastStore } from '../../stores/toastStore'


function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function countdownFrom(dateStr: string): string {
  const ms = new Date(dateStr).getTime() - Date.now()
  if (ms <= 0) return 'Ended'
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (d > 0) return `${d}d ${h}h left`
  if (h > 0) return `${h}h ${m}m left`
  return `${m}m left`
}

function eventLabel(type: string, payload: Record<string, unknown>): string {
  switch (type) {
    case 'join': return 'joined the guild'
    case 'leave': return 'left the guild'
    case 'deposit_gold': return `donated ${payload.amount ?? '?'}🪙`
    case 'goal_complete': return 'guild goal completed!'
    default: return type
  }
}

// ── Create guild modal ────────────────────────────────────────────────────────

function CreateGuildModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [tag, setTag] = useState('')
  const [desc, setDesc] = useState('')
  const [error, setError] = useState('')
  const createGuild = useGuildStore((s) => s.createGuild)
  const isLoading = useGuildStore((s) => s.isLoading)
  const pushToast = useToastStore((s) => s.push)

  const handleSubmit = async () => {
    if (name.trim().length < 3) { setError('Name must be 3–30 characters'); return }
    if (tag.trim().length < 2) { setError('Tag must be 2–5 characters'); return }
    const result = await createGuild(name.trim(), tag.trim().toUpperCase(), desc.trim() || undefined)
    if (result.ok) {
      pushToast({ kind: 'generic', message: `Guild [${tag.trim().toUpperCase()}] ${name.trim()} created!`, type: 'success' })
      onClose()
    } else {
      setError(result.error ?? 'Failed to create guild')
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-[320px] bg-[#1a1a2e] border border-white/10 rounded-2xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-white mb-4">Create Guild</p>
        <div className="space-y-2.5">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[9px] text-gray-500 font-mono uppercase">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Guild name (3–30)" maxLength={30}
                className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg bg-[#11111b] border border-white/[0.08] text-white text-[11px] placeholder-gray-600 outline-none focus:border-cyber-neon/40" />
            </div>
            <div className="w-20">
              <label className="text-[9px] text-gray-500 font-mono uppercase">Tag</label>
              <input value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} placeholder="TAG" maxLength={5}
                className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg bg-[#11111b] border border-white/[0.08] text-white text-[11px] font-mono placeholder-gray-600 outline-none focus:border-cyber-neon/40 uppercase" />
            </div>
          </div>
          <div>
            <label className="text-[9px] text-gray-500 font-mono uppercase">Description (optional)</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Brief description..." maxLength={200} rows={2}
              className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg bg-[#11111b] border border-white/[0.08] text-white text-[11px] placeholder-gray-600 outline-none focus:border-cyber-neon/40 resize-none" />
          </div>
          {error && <p className="text-[10px] text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl border border-white/15 text-gray-400 text-[11px] hover:bg-white/5 transition-colors">Cancel</button>
            <button type="button" onClick={handleSubmit} disabled={isLoading}
              className="flex-1 py-2 rounded-xl bg-cyber-neon/20 border border-cyber-neon/40 text-cyber-neon text-[11px] font-semibold hover:bg-cyber-neon/30 disabled:opacity-50 transition-colors">
              {isLoading ? '...' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Deposit gold modal ────────────────────────────────────────────────────────

function DepositGoldModal({ maxGold, onClose }: { maxGold: number; onClose: () => void }) {
  const [amount, setAmount] = useState(100)
  const depositGold = useGuildStore((s) => s.depositGold)
  const isLoading = useGuildStore((s) => s.isLoading)
  const pushToast = useToastStore((s) => s.push)

  const handleDeposit = async () => {
    if (amount < 1 || amount > maxGold) return
    const result = await depositGold(amount)
    if (result.ok) {
      pushToast({ kind: 'generic', message: `Donated ${amount}🪙 to guild chest`, type: 'success' })
      onClose()
    } else {
      pushToast({ kind: 'generic', message: result.error ?? 'Failed to donate', type: 'error' })
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-[260px] bg-[#1a1a2e] border border-white/10 rounded-2xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-white mb-1">Donate Gold</p>
        <p className="text-[10px] text-gray-500 mb-3">Available: {maxGold.toLocaleString()}🪙</p>
        <div className="flex items-center gap-2 mb-3">
          <button type="button" onClick={() => setAmount((a) => Math.max(1, a - 100))} className="w-8 h-8 rounded-lg border border-white/15 text-gray-300 hover:bg-white/10 transition-colors">−</button>
          <input type="number" min={1} max={maxGold} value={amount}
            onChange={(e) => setAmount(Math.max(1, Math.min(maxGold, Math.floor(Number(e.target.value) || 1))))}
            className="flex-1 text-center bg-[#11111b] border border-white/10 rounded-lg text-white text-sm font-bold py-1.5 outline-none focus:border-cyber-neon/40" />
          <button type="button" onClick={() => setAmount((a) => Math.min(maxGold, a + 100))} className="w-8 h-8 rounded-lg border border-white/15 text-gray-300 hover:bg-white/10 transition-colors">+</button>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setAmount(maxGold)} className="px-2 py-1 rounded-lg text-[9px] text-gray-500 border border-white/10 hover:bg-white/5 transition-colors">Max</button>
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl border border-white/15 text-gray-400 text-[11px] hover:bg-white/5 transition-colors">Cancel</button>
          <button type="button" onClick={handleDeposit} disabled={isLoading || amount < 1 || amount > maxGold}
            className="flex-1 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[11px] font-semibold hover:bg-amber-500/30 disabled:opacity-50 transition-colors">
            {isLoading ? '...' : `${amount}🪙`}
          </button>
        </div>
      </div>
    </div>
  )
}


// ── Browse guilds panel ───────────────────────────────────────────────────────

function BrowseGuilds({ onJoin }: { onJoin: (guildId: string) => void }) {
  const [guilds, setGuilds] = useState<Guild[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const isLoading = useGuildStore((s) => s.isLoading)

  useEffect(() => {
    fetchTopGuilds(15).then(setGuilds).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleSearch = async () => {
    if (!query.trim()) {
      setLoading(true)
      fetchTopGuilds(15).then(setGuilds).catch(() => {}).finally(() => setLoading(false))
      return
    }
    setLoading(true)
    searchGuilds(query.trim()).then(setGuilds).catch(() => {}).finally(() => setLoading(false))
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search guilds..." className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#11111b] border border-white/[0.08] text-white text-[11px] placeholder-gray-600 outline-none focus:border-amber-500/40" />
        <button type="button" onClick={handleSearch} className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] hover:bg-amber-500/25 transition-colors">Search</button>
      </div>
      {loading ? (
        <p className="text-[10px] text-gray-600 text-center py-4">Loading...</p>
      ) : guilds.length === 0 ? (
        <p className="text-[10px] text-gray-600 text-center py-4">No guilds found</p>
      ) : (
        <div className="space-y-1.5">
          {guilds.map((g) => (
            <div key={g.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-white/[0.08] bg-discord-card">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <span className="text-[9px] font-bold font-mono text-amber-400">{g.tag}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-white truncate">{g.name}</p>
                <p className="text-[9px] text-gray-500 font-mono">{g.member_count} members · 🪙{g.chest_gold.toLocaleString()}</p>
              </div>
              <button type="button" disabled={isLoading} onClick={() => { playClickSound(); onJoin(g.id) }}
                className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-cyber-neon/15 border border-cyber-neon/30 text-cyber-neon hover:bg-cyber-neon/25 disabled:opacity-50 transition-colors">
                Join
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main GuildTab ─────────────────────────────────────────────────────────────

export function GuildTab() {
  const { myGuild, membership, members, activityLog, pendingInvites, isLoading, fetchMyGuild } = useGuildStore()
  const joinGuild = useGuildStore((s) => s.joinGuild)
  const leaveGuild = useGuildStore((s) => s.leaveGuild)
  const respondToInvite = useGuildStore((s) => s.respondToInvite)
  const updateTaxRate = useGuildStore((s) => s.updateTaxRate)
  const kickMember = useGuildStore((s) => s.kickMember)
  const promoteMember = useGuildStore((s) => s.promoteMember)
  const demoteMember = useGuildStore((s) => s.demoteMember)
  const user = useAuthStore((s) => s.user)
  const gold = useGoldStore((s) => s.gold)
  const pushToast = useToastStore((s) => s.push)

  const [showCreate, setShowCreate] = useState(false)
  const [showDeposit, setShowDeposit] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [view, setView] = useState<'mine' | 'browse'>('mine')
  const [taxInput, setTaxInput] = useState<number | null>(null)
  const [savingTax, setSavingTax] = useState(false)
  const [confirmKick, setConfirmKick] = useState<string | null>(null)
  const [membersExpanded, setMembersExpanded] = useState(false)

  useEffect(() => {
    if (user) fetchMyGuild()
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (myGuild && taxInput === null) setTaxInput(myGuild.tax_rate_pct ?? 0)
  }, [myGuild?.tax_rate_pct]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleJoin = async (guildId: string) => {
    const result = await joinGuild(guildId)
    if (result.ok) { pushToast({ kind: 'generic', message: 'Joined guild!', type: 'success' }); setView('mine') }
    else pushToast({ kind: 'generic', message: result.error ?? 'Failed to join', type: 'error' })
  }

  const handleLeave = async () => {
    const result = await leaveGuild()
    if (result.ok) { pushToast({ kind: 'generic', message: 'Left guild', type: 'success' }); setConfirmLeave(false) }
  }

  const handleRespondInvite = async (inviteId: string, response: 'accepted' | 'declined') => {
    const result = await respondToInvite(inviteId, response)
    if (!result.ok) pushToast({ kind: 'generic', message: result.error ?? 'Failed', type: 'error' })
  }

  const handleSaveTax = async () => {
    if (taxInput === null) return
    setSavingTax(true)
    const result = await updateTaxRate(taxInput)
    setSavingTax(false)
    if (!result.ok) pushToast({ kind: 'generic', message: result.error ?? 'Failed', type: 'error' })
  }

  const handleKick = async (memberId: string) => {
    const result = await kickMember(memberId)
    if (!result.ok) pushToast({ kind: 'generic', message: result.error ?? 'Failed to kick', type: 'error' })
    setConfirmKick(null)
  }

  const handlePromote = async (memberId: string) => {
    const result = await promoteMember(memberId)
    if (!result.ok) pushToast({ kind: 'generic', message: result.error ?? 'Failed to promote', type: 'error' })
  }

  const handleDemote = async (memberId: string) => {
    const result = await demoteMember(memberId)
    if (!result.ok) pushToast({ kind: 'generic', message: result.error ?? 'Failed to demote', type: 'error' })
  }

  const isOwner = membership?.role === 'owner'
  const isOfficer = ['owner', 'officer'].includes(membership?.role ?? '')

  if (!user) return <p className="text-[11px] text-gray-500 text-center py-6">Log in to use guilds</p>

  return (
    <div className="space-y-3">

      {/* Pending invites for me */}
      {pendingInvites.length > 0 && !myGuild && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-amber-400/80 font-mono">Guild Invites</p>
          {pendingInvites.map((inv) => (
            <div key={inv.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <span className="text-[9px] font-bold font-mono text-amber-400">{inv.guild_tag}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-white truncate">{inv.guild_name}</p>
                <p className="text-[9px] text-gray-500 font-mono">from @{inv.inviter_username}</p>
              </div>
              <div className="flex gap-1">
                <button type="button" onClick={() => handleRespondInvite(inv.id, 'accepted')}
                  className="px-2 py-1 rounded-lg text-[9px] font-semibold bg-cyber-neon/15 border border-cyber-neon/30 text-cyber-neon hover:bg-cyber-neon/25 transition-colors">
                  Accept
                </button>
                <button type="button" onClick={() => handleRespondInvite(inv.id, 'declined')}
                  className="px-2 py-1 rounded-lg text-[9px] text-gray-500 border border-white/10 hover:bg-white/5 transition-colors">
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No guild: create / browse */}
      {!myGuild && (
        <>
          <div className="flex gap-2">
            <button type="button" onClick={() => { playClickSound(); setShowCreate(true) }}
              className="flex-1 py-2.5 rounded-xl bg-cyber-neon/15 border border-cyber-neon/30 text-cyber-neon text-[11px] font-semibold hover:bg-cyber-neon/25 transition-colors">
              + Create Guild
            </button>
            <button type="button" onClick={() => { playClickSound(); setView(view === 'browse' ? 'mine' : 'browse') }}
              className={`flex-1 py-2.5 rounded-xl border text-[11px] font-semibold transition-colors ${view === 'browse' ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'border-white/15 text-gray-400 hover:bg-white/5'}`}>
              Browse Guilds
            </button>
          </div>
          {view === 'browse' && <BrowseGuilds onJoin={handleJoin} />}
          {isLoading && <p className="text-[10px] text-gray-600 text-center py-2">Loading...</p>}
        </>
      )}

      {/* Has guild */}
      {myGuild && (
        <div className="space-y-3">

          {/* Guild header */}
          <div className="rounded-xl border border-white/[0.10] bg-discord-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-bold font-mono text-amber-400">{myGuild.tag}</span>
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-white leading-tight">{myGuild.name}</p>
                  <p className="text-[9px] text-gray-500 font-mono">{myGuild.member_count} member{myGuild.member_count !== 1 ? 's' : ''} · {isOwner ? '👑 Owner' : isOfficer ? '🔰 Officer' : 'Member'}</p>
                </div>
              </div>
              {confirmLeave ? (
                <div className="flex items-center gap-1">
                  <button type="button" onClick={handleLeave} disabled={isLoading} className="px-2 py-1 rounded-lg text-[9px] font-semibold border border-red-500/40 text-red-400 bg-red-500/15 hover:bg-red-500/25 transition-colors">Leave</button>
                  <button type="button" onClick={() => setConfirmLeave(false)} className="px-2 py-1 rounded-lg text-[9px] text-gray-400 border border-white/10 hover:bg-white/5 transition-colors">Cancel</button>
                </div>
              ) : (
                !isOwner && (
                  <button type="button" onClick={() => { playClickSound(); setConfirmLeave(true) }} className="text-[9px] text-gray-600 hover:text-red-400 transition-colors font-mono">leave</button>
                )
              )}
            </div>
            {myGuild.description && (
              <p className="text-[10px] text-gray-500 mt-2 leading-snug">{myGuild.description}</p>
            )}
          </div>

          {/* Guild Chest + Tax */}
          <div className="rounded-xl border border-white/[0.10] bg-discord-card p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-amber-400/80 font-mono">Guild Chest</p>
              <button type="button" onClick={() => { playClickSound(); setShowDeposit(true) }} disabled={gold <= 0}
                className="px-2 py-0.5 rounded-md text-[9px] font-semibold border border-amber-500/30 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-40 transition-colors">
                Donate
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-base">🪙</span>
              <span className="text-sm font-bold text-amber-400">{myGuild.chest_gold.toLocaleString()}g</span>
            </div>
            {/* Tax rate — owner only */}
            {isOwner && (
              <div className="border-t border-white/[0.06] pt-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] text-gray-500 font-mono uppercase">Auto-tax on arena gold</p>
                  <span className="text-[9px] text-amber-400 font-mono font-bold">{taxInput ?? 0}%</span>
                </div>
                <input type="range" min={0} max={15} step={1} value={taxInput ?? 0}
                  onChange={(e) => setTaxInput(Number(e.target.value))}
                  className="w-full h-1.5 accent-amber-400 cursor-pointer" />
                <div className="flex items-center justify-between text-[9px] text-gray-600 font-mono">
                  <span>0% (none)</span><span>15% (max)</span>
                </div>
                {(taxInput ?? 0) !== (myGuild.tax_rate_pct ?? 0) && (
                  <button type="button" onClick={handleSaveTax} disabled={savingTax}
                    className="w-full py-1 rounded-lg text-[9px] font-semibold border border-amber-500/30 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-50 transition-colors">
                    {savingTax ? 'Saving...' : 'Save tax rate'}
                  </button>
                )}
              </div>
            )}
            {!isOwner && (myGuild.tax_rate_pct ?? 0) > 0 && (
              <p className="text-[9px] text-gray-600 font-mono">Auto-tax: {myGuild.tax_rate_pct}% of arena gold → guild chest</p>
            )}
          </div>

          {/* Weekly Goal */}
          {myGuild.weekly_goal_progress && Object.keys(myGuild.weekly_goal_progress).length > 0 && (
            <div className="rounded-xl border border-white/[0.10] bg-discord-card p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-purple-400/80 font-mono">Weekly Goal</p>
              {Object.entries(myGuild.weekly_goal_progress).map(([type, current]) => {
                const targets: Record<string, number> = { craft: 200, kill: 500, farm: 300, gold: 10000 }
                const target = targets[type] ?? 100
                const pct = Math.min(100, (current / target) * 100)
                return (
                  <div key={type} className="space-y-1">
                    <div className="flex justify-between text-[9px] font-mono">
                      <span className="text-gray-400 capitalize">{type}</span>
                      <span className="text-gray-500">{current}/{target}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="h-full rounded-full bg-purple-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Members */}
          <div className="rounded-xl border border-white/[0.10] bg-discord-card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-mono">Members ({members.length})</p>
            </div>
            <div className="space-y-1.5">
              {(membersExpanded ? members : members.slice(0, 12)).map((m) => {
                const isMe = m.user_id === user?.id
                const canKick = !isMe && m.role !== 'owner' && (isOwner || (isOfficer && m.role === 'member'))
                const canPromote = isOwner && !isMe && m.role === 'member'
                const canDemote = isOwner && !isMe && m.role === 'officer'
                const confirmingKick = confirmKick === m.user_id
                return (
                  <div key={m.id} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-white/[0.08] flex items-center justify-center text-[9px] text-gray-400 font-mono shrink-0">
                      {(m.username ?? '?')[0].toUpperCase()}
                    </div>
                    <p className="flex-1 text-[11px] text-white truncate min-w-0">{m.username ?? 'Unknown'}</p>
                    <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded border ${m.role === 'owner' ? 'text-amber-400 border-amber-500/30' : m.role === 'officer' ? 'text-blue-400 border-blue-500/30' : 'text-gray-500 border-white/[0.06]'}`}>
                      {m.role}
                    </span>
                    {m.contribution_gold > 0 && (
                      <span className="text-[9px] text-amber-400/70 font-mono shrink-0">+{m.contribution_gold >= 1000 ? `${(m.contribution_gold / 1000).toFixed(1)}k` : m.contribution_gold}🪙</span>
                    )}
                    {/* Promote/Demote buttons (owner only) */}
                    {canPromote && (
                      <button type="button" onClick={() => handlePromote(m.user_id)} title="Promote to officer"
                        className="text-[9px] text-blue-400/70 hover:text-blue-400 font-mono px-1 transition-colors">↑</button>
                    )}
                    {canDemote && (
                      <button type="button" onClick={() => handleDemote(m.user_id)} title="Demote to member"
                        className="text-[9px] text-gray-500 hover:text-gray-300 font-mono px-1 transition-colors">↓</button>
                    )}
                    {/* Kick button */}
                    {canKick && (
                      confirmingKick ? (
                        <div className="flex items-center gap-1">
                          <span className="text-[8px] text-red-400 font-mono">Kick?</span>
                          <button type="button" onClick={() => handleKick(m.user_id)}
                            className="text-[8px] px-1 py-0.5 rounded border border-red-500/40 text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors font-mono">✓</button>
                          <button type="button" onClick={() => setConfirmKick(null)}
                            className="text-[8px] px-1 py-0.5 rounded border border-white/10 text-gray-500 hover:bg-white/5 transition-colors font-mono">✕</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setConfirmKick(m.user_id)} title="Kick member"
                          className="text-[9px] text-red-500/50 hover:text-red-400 font-mono px-1 transition-colors">✕</button>
                      )
                    )}
                  </div>
                )
              })}
            </div>
            {/* Expand/collapse toggle */}
            {members.length > 12 && (
              <button type="button" onClick={() => setMembersExpanded((v) => !v)}
                className="text-[9px] text-gray-600 hover:text-gray-400 font-mono transition-colors">
                {membersExpanded ? '▲ show less' : `+ ${members.length - 12} more`}
              </button>
            )}
          </div>

          {/* Activity Log */}
          {activityLog.length > 0 && (
            <div className="rounded-xl border border-white/[0.10] bg-discord-card p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-mono">Activity</p>
              <div className="space-y-1.5">
                {activityLog.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="flex items-center gap-2 text-[10px]">
                    <span className="text-gray-300 font-medium shrink-0">@{entry.username ?? 'Unknown'}</span>
                    <span className="text-gray-500 truncate">{eventLabel(entry.event_type, entry.payload)}</span>
                    <span className="text-gray-700 font-mono ml-auto shrink-0">{timeAgo(entry.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showCreate && (
          <motion.div key="create" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <CreateGuildModal onClose={() => setShowCreate(false)} />
          </motion.div>
        )}
        {showDeposit && (
          <motion.div key="deposit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <DepositGoldModal maxGold={gold} onClose={() => setShowDeposit(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
