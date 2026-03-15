import { create } from 'zustand'
import {
  fetchMyGuild, fetchGuildMembers, fetchGuildActivityLog,
  fetchPendingInvites, sendGuildInvite, respondToInvite as apiRespondToInvite,
  setGuildTaxRate,
  createGuild as apiCreateGuild, joinGuild as apiJoinGuild,
  leaveGuild as apiLeaveGuild, depositGold as apiDepositGold, joinGuild,
  kickMember as apiKickMember, promoteMember as apiPromoteMember, demoteMember as apiDemoteMember,
  type Guild, type GuildMember, type GuildActivityLogEntry, type GuildInvite,
} from '../services/guildService'
import { useGoldStore } from './goldStore'
import { useAuthStore } from './authStore'
import { supabase } from '../lib/supabase'

interface GuildRaidGoal { current: number; target: number }
interface GuildRaid {
  id: string
  status: 'active' | 'completed' | 'failed'
  goals: Partial<Record<string, GuildRaidGoal>>
}

interface GuildState {
  myGuild: Guild | null
  membership: GuildMember | null
  members: GuildMember[]
  activityLog: GuildActivityLogEntry[]
  pendingInvites: GuildInvite[]
  activeRaid: GuildRaid | null
  isLoading: boolean
  error: string | null

  fetchMyGuild: () => Promise<void>
  createGuild: (name: string, tag: string, description?: string) => Promise<{ ok: boolean; error?: string }>
  joinGuild: (guildId: string) => Promise<{ ok: boolean; error?: string }>
  leaveGuild: () => Promise<{ ok: boolean; error?: string }>
  depositGold: (amount: number) => Promise<{ ok: boolean; error?: string }>
  sendInvite: (inviteeId: string) => Promise<{ ok: boolean; error?: string }>
  respondToInvite: (inviteId: string, response: 'accepted' | 'declined') => Promise<{ ok: boolean; error?: string }>
  updateTaxRate: (rate: number) => Promise<{ ok: boolean; error?: string }>
  kickMember: (memberId: string) => Promise<{ ok: boolean; error?: string }>
  promoteMember: (memberId: string) => Promise<{ ok: boolean; error?: string }>
  demoteMember: (memberId: string) => Promise<{ ok: boolean; error?: string }>
  launchRaid: (raidType: string) => Promise<{ ok: boolean; error?: string }>
  incrementRaidProgress: (type: string, delta: number) => void
}

export const useGuildStore = create<GuildState>()((set, get) => ({
  myGuild: null,
  membership: null,
  members: [],
  activityLog: [],
  pendingInvites: [],
  activeRaid: null,
  isLoading: false,
  error: null,

  async fetchMyGuild() {
    const user = useAuthStore.getState().user
    if (!user) return
    set({ isLoading: true, error: null })
    try {
      const [{ guild, membership }, pendingInvites] = await Promise.all([
        fetchMyGuild(user.id),
        fetchPendingInvites(user.id),
      ])
      set({ myGuild: guild, membership, pendingInvites })
      if (guild) {
        const [members, activityLog] = await Promise.all([
          fetchGuildMembers(guild.id),
          fetchGuildActivityLog(guild.id),
        ])
        set({ members, activityLog })
      }
    } catch (err) {
      set({ error: String(err) })
    } finally {
      set({ isLoading: false })
    }
  },

  async createGuild(name, tag, description) {
    const user = useAuthStore.getState().user
    if (!user) return { ok: false, error: 'Not logged in' }
    set({ isLoading: true, error: null })
    try {
      const result = await apiCreateGuild(user.id, name, tag, description)
      if (result.ok && result.guild) {
        set({ myGuild: result.guild, membership: { id: '', guild_id: result.guild.id, user_id: user.id, role: 'owner', joined_at: new Date().toISOString(), contribution_gold: 0 }, members: [], activityLog: [] })
        await get().fetchMyGuild()
      }
      return result.ok ? { ok: true } : { ok: false, error: result.error }
    } catch (err) {
      return { ok: false, error: String(err) }
    } finally {
      set({ isLoading: false })
    }
  },

  async joinGuild(guildId) {
    const user = useAuthStore.getState().user
    if (!user) return { ok: false, error: 'Not logged in' }
    if (get().myGuild) return { ok: false, error: 'Already in a guild' }
    set({ isLoading: true, error: null })
    try {
      const result = await apiJoinGuild(user.id, guildId)
      if (result.ok) await get().fetchMyGuild()
      return result
    } catch (err) {
      return { ok: false, error: String(err) }
    } finally {
      set({ isLoading: false })
    }
  },

  async leaveGuild() {
    const user = useAuthStore.getState().user
    const { myGuild } = get()
    if (!user || !myGuild) return { ok: false, error: 'Not in a guild' }
    set({ isLoading: true, error: null })
    try {
      const result = await apiLeaveGuild(user.id, myGuild.id)
      if (result.ok) set({ myGuild: null, membership: null, members: [], activityLog: [] })
      return result
    } catch (err) {
      return { ok: false, error: String(err) }
    } finally {
      set({ isLoading: false })
    }
  },

  async sendInvite(inviteeId) {
    const user = useAuthStore.getState().user
    const { myGuild, membership } = get()
    if (!user || !myGuild) return { ok: false, error: 'Not in a guild' }
    if (!membership || !['owner', 'officer'].includes(membership.role)) return { ok: false, error: 'Need officer+ role' }
    return sendGuildInvite(myGuild.id, user.id, inviteeId)
  },

  async respondToInvite(inviteId, response) {
    const user = useAuthStore.getState().user
    if (!user) return { ok: false, error: 'Not logged in' }
    // Find the invite BEFORE filtering it out
    const invite = get().pendingInvites.find((i) => i.id === inviteId)
    const result = await apiRespondToInvite(inviteId, response)
    if (result.ok) {
      set((s) => ({ pendingInvites: s.pendingInvites.filter((i) => i.id !== inviteId) }))
      if (response === 'accepted' && invite) {
        await joinGuild(user.id, invite.guild_id)
        await get().fetchMyGuild()
      }
    }
    return result
  },

  async launchRaid(_raidType) {
    // Guild async raids — not yet wired to backend
    return { ok: false, error: 'Guild raids coming soon' }
  },

  incrementRaidProgress(type, delta) {
    const { activeRaid } = get()
    if (!activeRaid || activeRaid.status !== 'active' || !activeRaid.goals[type] || delta <= 0) return
    set((s) => {
      if (!s.activeRaid) return s
      const goals = { ...s.activeRaid.goals }
      if (!goals[type]) return s
      goals[type] = { ...goals[type]!, current: goals[type]!.current + delta }
      const allDone = Object.values(goals).every((g) => g && g.current >= g.target)
      return { activeRaid: { ...s.activeRaid, goals, status: allDone ? 'completed' : 'active' } }
    })
  },

  async updateTaxRate(rate) {
    const { myGuild } = get()
    if (!myGuild) return { ok: false, error: 'Not in a guild' }
    const result = await setGuildTaxRate(myGuild.id, rate)
    if (result.ok) set((s) => s.myGuild ? { myGuild: { ...s.myGuild!, tax_rate_pct: Math.max(0, Math.min(15, rate)) } } : s)
    return result
  },

  async depositGold(amount) {
    const user = useAuthStore.getState().user
    const { myGuild } = get()
    if (!user || !myGuild) return { ok: false, error: 'Not in a guild' }
    const currentGold = useGoldStore.getState().gold
    if (currentGold < amount) return { ok: false, error: 'Not enough gold' }

    set({ isLoading: true, error: null })
    try {
      // Deduct from local gold
      useGoldStore.getState().addGold(-amount)
      if (supabase) useGoldStore.getState().syncToSupabase(user.id)

      const result = await apiDepositGold(user.id, myGuild.id, amount)
      if (result.ok) {
        // Refresh guild data
        await get().fetchMyGuild()
      } else {
        // Refund on failure
        useGoldStore.getState().addGold(amount)
      }
      return result
    } catch (err) {
      useGoldStore.getState().addGold(amount) // refund
      return { ok: false, error: String(err) }
    } finally {
      set({ isLoading: false })
    }
  },

  async kickMember(memberId) {
    const { myGuild, membership } = get()
    if (!myGuild) return { ok: false, error: 'Not in a guild' }
    if (!membership || !['owner', 'officer'].includes(membership.role)) return { ok: false, error: 'Insufficient permissions' }
    const result = await apiKickMember(myGuild.id, memberId)
    if (result.ok) {
      set((s) => ({ members: s.members.filter((m) => m.user_id !== memberId) }))
    }
    return result
  },

  async promoteMember(memberId) {
    const { myGuild, membership } = get()
    if (!myGuild) return { ok: false, error: 'Not in a guild' }
    if (membership?.role !== 'owner') return { ok: false, error: 'Only owner can promote' }
    const result = await apiPromoteMember(myGuild.id, memberId)
    if (result.ok) {
      set((s) => ({ members: s.members.map((m) => m.user_id === memberId ? { ...m, role: 'officer' as const } : m) }))
    }
    return result
  },

  async demoteMember(memberId) {
    const { myGuild, membership } = get()
    if (!myGuild) return { ok: false, error: 'Not in a guild' }
    if (membership?.role !== 'owner') return { ok: false, error: 'Only owner can demote' }
    const result = await apiDemoteMember(myGuild.id, memberId)
    if (result.ok) {
      set((s) => ({ members: s.members.map((m) => m.user_id === memberId ? { ...m, role: 'member' as const } : m) }))
    }
    return result
  },
}))
