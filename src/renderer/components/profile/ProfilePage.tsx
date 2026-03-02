import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { ACHIEVEMENTS } from '../../lib/xp'
import { computeTotalSkillLevel, getSkillById, MAX_TOTAL_SKILL_LEVEL } from '../../lib/skills'
import { defaultSkillForAchievement } from '../../services/rewardGrant'
import type { AchievementDef } from '../../lib/xp'
import { useAlertStore } from '../../stores/alertStore'
import { playClickSound } from '../../lib/sounds'
import { detectPersona } from '../../lib/persona'
import { BADGES, FRAMES, FREE_AVATARS, LOCKED_AVATARS, getUnlockedBadges, getUnlockedFrames, getEquippedBadges, getEquippedFrame, equipBadge, unequipBadge, equipFrame, getUnlockedAvatarEmojis, unlockCosmeticsFromAchievement } from '../../lib/cosmetics'
import { syncCosmeticsToSupabase } from '../../services/supabaseSync'
import { PageHeader } from '../shared/PageHeader'
import { InlineSuccess } from '../shared/InlineSuccess'
import { MOTION } from '../../lib/motion'
import { getEquippedPerkRuntime, LOOT_ITEMS, type LootSlot } from '../../lib/loot'
import { ensureInventoryHydrated, useInventoryStore } from '../../stores/inventoryStore'
import { DailyMissionsWidget } from '../home/DailyMissionsWidget'
import { getDailyActivities } from '../../services/dailyActivityService'
import { AvatarWithFrame } from '../shared/AvatarWithFrame'


const CATEGORY_LABELS: Record<string, string> = {
  grind: '⚡ Grind',
  streak: '🔥 Streak',
  social: '🤝 Social',
  special: '✨ Special',
  skill: '⚡ Skills',
}

type ProfileTab = 'achievements' | 'cosmetics'

export function ProfilePage({ onBack }: { onBack?: () => void }) {
  const inventory = useInventoryStore((s) => s.items)
  const chests = useInventoryStore((s) => s.chests)
  const equippedBySlot = useInventoryStore((s) => s.equippedBySlot)

  const { user } = useAuthStore()
  const pushAlert = useAlertStore((s) => s.push)

  // Profile data
  const [username, setUsername] = useState('Grindly')
  const [avatar, setAvatar] = useState('🤖')
  const [originalUsername, setOriginalUsername] = useState('Grindly')
  const [originalAvatar, setOriginalAvatar] = useState('🤖')
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false)
  const [isUsernameEditing, setIsUsernameEditing] = useState(false)
  const [draftUsername, setDraftUsername] = useState('Grindly')

  // Stats
  const [totalSkillLevel, setTotalSkillLevel] = useState(0)
  const [persona, setPersona] = useState<{ emoji: string; label: string; description: string } | null>(null)

  // Achievements
  const [unlockedIds, setUnlockedIds] = useState<string[]>([])
  const [claimedIds, setClaimedIds] = useState<string[]>([])

  // Cosmetics
  const [equippedBadges, setEquippedBadges] = useState<string[]>([])
  const [equippedFrameId, setEquippedFrameId] = useState<string | null>(null)
  const [unlockedBadgeIds, setUnlockedBadgeIds] = useState<string[]>([])
  const [unlockedFrameIds, setUnlockedFrameIds] = useState<string[]>([])

  // Tab
  const [activeTab, setActiveTab] = useState<ProfileTab>('achievements')

  useEffect(() => {
    if (user) {
      const cacheKey = `grindly_profile_cache_${user.id}`
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || '{}') as { username?: string; avatar?: string }
        if (cached.username || cached.avatar) {
          const nextUsername = (cached.username || 'Grindly').trim()
          const nextAvatar = cached.avatar || '🤖'
          setUsername(nextUsername)
          setAvatar(nextAvatar)
          setOriginalUsername(nextUsername)
          setOriginalAvatar(nextAvatar)
          setProfileLoaded(true)
        }
      } catch {
        // ignore broken cache
      }
    }

    // Load profile
    if (supabase && user) {
      supabase.from('profiles').select('username, avatar_url').eq('id', user.id).single().then(({ data }) => {
        if (data) {
          const nextUsername = (data.username || 'Grindly').trim()
          const nextAvatar = data.avatar_url || '🤖'
          setUsername(nextUsername)
          setAvatar(nextAvatar)
          setOriginalUsername(nextUsername)
          setOriginalAvatar(nextAvatar)
          const cacheKey = `grindly_profile_cache_${user.id}`
          localStorage.setItem(cacheKey, JSON.stringify({ username: nextUsername, avatar: nextAvatar }))
        }
        setProfileLoaded(true)
      }).catch(() => setProfileLoaded(true))
    } else {
      setProfileLoaded(true)
    }

    // Load local stats
    const api = window.electronAPI
    if (api?.db) {
      if (api.db.getAllSkillXP) {
        api.db.getAllSkillXP().then((rows: { skill_id: string; total_xp: number }[]) => {
          setTotalSkillLevel(computeTotalSkillLevel(rows || []))
        })
      }
      api.db.getUnlockedAchievements().then(setUnlockedIds)
    } else {
      try {
        const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
        setTotalSkillLevel(computeTotalSkillLevel(Object.entries(stored).map(([skill_id, total_xp]) => ({ skill_id, total_xp }))))
      } catch {
        setTotalSkillLevel(0)
      }
      setUnlockedIds(JSON.parse(localStorage.getItem('grindly_unlocked_achievements') || '[]'))
    }

    setClaimedIds(JSON.parse(localStorage.getItem('grindly_claimed_achievements') || '[]'))

    // Persona
    if (api?.db?.getCategoryStats) {
      api.db.getCategoryStats().then((cats) => {
        setPersona(detectPersona((cats || []) as { category: string; total_ms: number }[]))
      })
    } else {
      setPersona(detectPersona([]))
    }

    // Cosmetics
    setEquippedBadges(getEquippedBadges())
    setEquippedFrameId(getEquippedFrame())
    setUnlockedBadgeIds(getUnlockedBadges())
    setUnlockedFrameIds(getUnlockedFrames())
    ensureInventoryHydrated()
  }, [user])

  // Sync equipped loot to Supabase when Profile opens (so friends see loadout right away)
  useEffect(() => {
    if (!supabase || !user) return
    ensureInventoryHydrated()
    const equippedLoot = useInventoryStore.getState().equippedBySlot
    const perk = getEquippedPerkRuntime(equippedLoot)
    syncCosmeticsToSupabase(getEquippedBadges(), getEquippedFrame(), {
      equippedLoot: (equippedLoot ?? {}) as Record<string, string>,
      statusTitle: perk.statusTitle,
    }).catch(() => {})
  }, [user])

  // Ensure cosmetics are unlocked from already-unlocked achievements (source of truth).
  useEffect(() => {
    if (!unlockedIds.length) return
    for (const achievementId of unlockedIds) {
      unlockCosmeticsFromAchievement(achievementId)
    }
    setUnlockedBadgeIds(getUnlockedBadges())
    setUnlockedFrameIds(getUnlockedFrames())
  }, [unlockedIds])

  useEffect(() => {
    setDraftUsername(username)
  }, [username])

  useEffect(() => {
    setIsAvatarPickerOpen(false)
    setIsUsernameEditing(false)
  }, [activeTab])

  // Starter pack moved to InventoryPage ("Newbie Pack" claim flow)

  const persistProfile = async (nextUsername: string, nextAvatar: string) => {
    const trimmedUsername = nextUsername.trim()
    if (!user) return false

    // Always keep local state in sync even if cloud is unavailable.
    const cacheKey = `grindly_profile_cache_${user.id}`
    const applyLocal = () => {
      setUsername(trimmedUsername)
      setAvatar(nextAvatar)
      setOriginalUsername(trimmedUsername)
      setOriginalAvatar(nextAvatar)
      localStorage.setItem(cacheKey, JSON.stringify({ username: trimmedUsername, avatar: nextAvatar }))
    }

    if (!supabase) {
      applyLocal()
      setMessage({ type: 'ok', text: 'Saved locally.' })
      return true
    }

    if (trimmedUsername === originalUsername && nextAvatar === originalAvatar) return true

    setSaving(true)
    setMessage(null)
    if (trimmedUsername.length < 3) {
      setMessage({ type: 'err', text: 'Min 3 characters.' })
      setSaving(false)
      return false
    }
    if (trimmedUsername !== originalUsername) {
      const { data } = await supabase.from('profiles').select('id').eq('username', trimmedUsername).limit(1)
      if (data && data.length > 0 && data[0].id !== user.id) {
        setMessage({ type: 'err', text: 'Username taken.' })
        setSaving(false)
        return false
      }
    }
    const { error } = await supabase.from('profiles').update({
      username: trimmedUsername,
      avatar_url: nextAvatar,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id)
    if (error) {
      setMessage({ type: 'err', text: error.message })
      setSaving(false)
      return false
    } else {
      applyLocal()
      setMessage({ type: 'ok', text: 'Saved.' })
    }
    setSaving(false)
    return true
  }

  const handleClaim = (def: AchievementDef) => {
    playClickSound()
    const updated = [...claimedIds, def.id]
    setClaimedIds(updated)
    localStorage.setItem('grindly_claimed_achievements', JSON.stringify(updated))
    pushAlert(def)
  }

  const persistCosmeticsToSupabase = (badges: string[], frame: string | null) => {
    if (!supabase || !user) return
    const statusTitle = equippedLootItems.find((entry) => entry.item.slot === 'ring')?.item.perkType === 'status_title'
      ? String(equippedLootItems.find((entry) => entry.item.slot === 'ring')?.item.perkValue ?? '')
      : null
    syncCosmeticsToSupabase(badges, frame, {
      equippedLoot: equippedBySlot as Record<string, string>,
      statusTitle,
    }).catch(() => {})
  }

  const handleEquipBadge = (badgeId: string) => {
    playClickSound()
    let newBadges: string[]
    if (equippedBadges.includes(badgeId)) {
      unequipBadge(badgeId)
      newBadges = equippedBadges.filter(b => b !== badgeId)
    } else {
      if (equippedBadges.length >= 3) {
        setMessage({ type: 'err', text: 'Max 3 badges equipped.' })
        return
      }
      equipBadge(badgeId)
      newBadges = [...equippedBadges, badgeId]
    }
    setEquippedBadges(newBadges)
    persistCosmeticsToSupabase(newBadges, equippedFrameId)
  }

  const handleEquipFrame = (frameId: string) => {
    playClickSound()
    const newFrame = equippedFrameId === frameId ? null : frameId
    equipFrame(newFrame)
    setEquippedFrameId(newFrame)
    persistCosmeticsToSupabase(equippedBadges, newFrame)
  }

  // Find the active frame
  const activeFrame = FRAMES.find(f => f.id === equippedFrameId)
  const equippedLootItems = (Object.entries(equippedBySlot) as Array<[LootSlot, string]>)
    .map(([slot, itemId]) => ({ slot, item: LOOT_ITEMS.find((x) => x.id === itemId) }))
    .filter((entry): entry is { slot: LootSlot; item: (typeof LOOT_ITEMS)[number] } => Boolean(entry.item))


  const applyDraftUsername = async () => {
    const sanitized = draftUsername.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20)
    await persistProfile(sanitized || 'Grindly', avatar)
    setDraftUsername(sanitized || 'Grindly')
    setIsUsernameEditing(false)
  }

  const unlockedAvatarSet = new Set(getUnlockedAvatarEmojis())
  const bonusAvatars = getUnlockedAvatarEmojis().filter(
    (a) => !FREE_AVATARS.includes(a) && !LOCKED_AVATARS.some((la) => la.emoji === a),
  )

  const categories = ['grind', 'streak', 'social', 'special', 'skill']
  const unlockedCount = ACHIEVEMENTS.filter(a => unlockedIds.includes(a.id)).length
  const dailyActivities = useMemo(() => getDailyActivities(), [activeTab, inventory, chests])
  const hasClaimableQuest = dailyActivities.some((mission) => mission.completed && !mission.claimed)
  const hasQuestAttention = hasClaimableQuest || dailyActivities.some((mission) => !mission.claimed)

  return (
    <div
      className="p-4 pb-20 space-y-4 overflow-auto"
    >
      {/* Header */}
      <PageHeader title="Profile" onBack={onBack} />

      {/* Profile Card */}
      <div className="rounded-2xl bg-gradient-to-br from-discord-card/90 to-discord-card/60 border border-white/10 p-5 relative overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, white 0px, transparent 1px, transparent 20px), repeating-linear-gradient(90deg, white 0px, transparent 1px, transparent 20px)' }} />

        <div className="relative flex items-center gap-4">
          {/* Avatar with frame */}
          <button
            type="button"
            onClick={() => {
              playClickSound()
              setIsAvatarPickerOpen((v) => !v)
            }}
            className="relative shrink-0"
            title="Click to change avatar"
          >
            <AvatarWithFrame
              avatar={profileLoaded ? avatar : '🤖'}
              frameId={equippedFrameId}
              sizeClass="w-16 h-16"
              textClass="text-3xl"
              roundedClass="rounded-xl"
              ringInsetClass="-inset-0.5"
              ringOpacity={0.8}
            />
            {!profileLoaded && (
              <span className="absolute inset-0 m-auto w-8 h-8 rounded-md bg-white/10 animate-pulse" />
            )}
          </button>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {isUsernameEditing ? (
                <input
                  type="text"
                  value={draftUsername}
                  onChange={(e) => setDraftUsername(e.target.value)}
                  onBlur={applyDraftUsername}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyDraftUsername()
                    if (e.key === 'Escape') {
                      setDraftUsername(username)
                      setIsUsernameEditing(false)
                    }
                  }}
                  autoFocus
                  className="text-white font-bold text-base truncate bg-transparent border-b border-cyber-neon/40 focus:border-cyber-neon/80 outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    playClickSound()
                    setIsUsernameEditing(true)
                    setDraftUsername(username)
                  }}
                  className="text-white font-bold text-base truncate hover:text-cyber-neon transition-colors"
                  title="Click to edit username"
                >
                  {profileLoaded ? (username || 'Grindly') : 'Loading...'}
                </button>
              )}
              <span className="text-cyber-neon font-mono text-xs" title="Total skill level">{totalSkillLevel}/{MAX_TOTAL_SKILL_LEVEL}</span>
            </div>

            {equippedBadges.length > 0 && (
              <div className="flex items-center gap-1 mb-1.5">
                {equippedBadges.map(bId => {
                  const badge = BADGES.find(b => b.id === bId)
                  return badge ? (
                    <span
                      key={bId}
                      className="text-[10px] px-1.5 py-0.5 rounded-md border font-medium"
                      style={{ borderColor: `${badge.color}40`, backgroundColor: `${badge.color}15`, color: badge.color }}
                      title={badge.name}
                    >
                      {badge.icon} {badge.label}
                    </span>
                  ) : null
                })}
              </div>
            )}
            <p className="text-[10px] text-gray-600 mt-1">Click avatar or nickname to edit.</p>
            {supabase && user && (
              <button
                type="button"
                onClick={async () => {
                  ensureInventoryHydrated()
                  const equippedLoot = useInventoryStore.getState().equippedBySlot
                  const perk = getEquippedPerkRuntime(equippedLoot)
                  const res = await syncCosmeticsToSupabase(getEquippedBadges(), getEquippedFrame(), {
                    equippedLoot: (equippedLoot ?? {}) as Record<string, string>,
                    statusTitle: perk.statusTitle,
                  })
                  playClickSound()
                  setMessage(res.ok ? { type: 'ok', text: 'Cosmetics synced.' } : { type: 'err', text: res.error ?? 'Sync failed' })
                }}
                className="text-[9px] text-cyber-neon/80 hover:text-cyber-neon mt-0.5"
              >
                Sync cosmetics to cloud
              </button>
            )}
          </div>
        </div>
      </div>

      {isAvatarPickerOpen && (
        <div className="rounded-xl bg-discord-card/90 border border-cyber-neon/20 p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Choose avatar</p>
          <div className="flex flex-wrap gap-1.5">
            {FREE_AVATARS.map((a) => (
              <button
                type="button"
                key={a}
                onClick={() => {
                  void persistProfile(username, a)
                  setIsAvatarPickerOpen(false)
                  playClickSound()
                }}
                className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all active:scale-90 ${
                  avatar === a
                    ? 'bg-cyber-neon/20 border-2 border-cyber-neon shadow-glow-sm'
                    : 'bg-discord-dark border border-white/10 hover:border-white/20'
                }`}
              >
                {a}
              </button>
            ))}
            {LOCKED_AVATARS.map((la) => {
              const isUnlocked = unlockedIds.includes(la.achievementId) || unlockedAvatarSet.has(la.emoji)
              return (
                <button
                  type="button"
                  key={la.emoji}
                  onClick={() => {
                    if (!isUnlocked) return
                    void persistProfile(username, la.emoji)
                    setIsAvatarPickerOpen(false)
                    playClickSound()
                  }}
                  disabled={!isUnlocked}
                  title={isUnlocked ? la.emoji : la.unlockHint}
                  className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all relative ${
                    isUnlocked
                      ? avatar === la.emoji
                        ? 'bg-cyber-neon/20 border-2 border-cyber-neon shadow-glow-sm active:scale-90'
                        : 'bg-discord-dark border border-white/10 hover:border-white/20 active:scale-90'
                      : 'bg-discord-dark/50 border border-white/5 cursor-not-allowed'
                  }`}
                >
                  <span style={{ opacity: isUnlocked ? 1 : 0.25 }}>{la.emoji}</span>
                  {!isUnlocked && (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px]">🔒</span>
                  )}
                </button>
              )
            })}
            {bonusAvatars.map((a) => (
              <button
                type="button"
                key={a}
                onClick={() => {
                  void persistProfile(username, a)
                  setIsAvatarPickerOpen(false)
                  playClickSound()
                }}
                className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all active:scale-90 ${
                  avatar === a
                    ? 'bg-cyber-neon/20 border-2 border-cyber-neon shadow-glow-sm'
                    : 'bg-discord-dark border border-white/10 hover:border-white/20'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      )}

      {saving && (
        <p className="text-xs text-center text-cyber-neon/80 font-mono">Saving...</p>
      )}

      {message && (
        message.type === 'ok'
          ? <InlineSuccess message={message.text} className="justify-self-center text-center" />
          : <p className="text-xs text-center text-discord-red">{message.text}</p>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-discord-darker/50 rounded-xl p-1">
        {([
          { id: 'achievements' as const, label: `Quests (${unlockedCount}/${ACHIEVEMENTS.length})`, icon: '🏆' },
          { id: 'cosmetics' as const, label: 'Cosmetics', icon: '✨' },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); playClickSound() }}
            className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-discord-card text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
            {tab.id === 'achievements' && hasQuestAttention && (
              <span
                className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full ${hasClaimableQuest ? 'bg-cyber-neon' : 'bg-orange-400'}`}
                title={hasClaimableQuest ? 'Quests ready to claim' : 'Daily quests available'}
              />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ACHIEVEMENTS TAB */}
        {activeTab === 'achievements' && (
          <motion.div
            key="achievements"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            <div className="rounded-xl border border-white/10 bg-discord-card/50 p-2.5">
              <DailyMissionsWidget />
            </div>
            {categories.map((cat) => {
              const items = ACHIEVEMENTS.filter((a) => a.category === cat)
              if (items.length === 0) return null
              const catUnlocked = items.filter((a) => unlockedIds.includes(a.id)).length
              return (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] text-gray-400 font-mono uppercase tracking-wider">
                      {CATEGORY_LABELS[cat] || cat}
                    </span>
                    <span className="text-[10px] text-gray-600 font-mono">{catUnlocked}/{items.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {items.map((a, i) => {
                      const unlocked = unlockedIds.includes(a.id)
                      const claimed = claimedIds.includes(a.id)
                      const canClaim = unlocked && !claimed && a.reward
                      return (
                        <motion.div
                          key={a.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03 }}
                          className={`flex items-center gap-3 rounded-xl p-3 border ${
                            unlocked
                              ? 'border-cyber-neon/20 bg-cyber-neon/5'
                              : 'border-white/5 bg-discord-dark/50 opacity-40'
                          }`}
                        >
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0 ${
                            unlocked ? 'bg-cyber-neon/15' : 'bg-discord-dark'
                          }`}>
                            {unlocked ? a.icon : '🔒'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${unlocked ? 'text-white' : 'text-gray-400'}`}>
                              {a.name}
                            </p>
                            <p className="text-[10px] text-gray-500 truncate">{a.description}</p>
                            {a.reward && unlocked && claimed && (
                              <p className="text-[9px] text-cyber-neon/60 font-mono mt-0.5">{a.reward.value} {a.reward.label}</p>
                            )}
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            <span className={`text-[10px] font-mono ${unlocked ? 'text-cyber-neon' : 'text-gray-600'}`}>+{a.xpReward} xp {(() => { const s = getSkillById(defaultSkillForAchievement(a)); return s ? s.icon : '' })()}</span>
                            {canClaim && (
                              <button
                                onClick={() => handleClaim(a)}
                                className="px-2 py-1 rounded-lg bg-cyber-neon text-discord-darker text-[9px] font-bold active:scale-95 transition-all hover:shadow-glow-sm animate-pulse"
                              >
                                CLAIM
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </motion.div>
        )}

        {/* COSMETICS TAB (Badges + Frames) */}
        {activeTab === 'cosmetics' && (
          <motion.div
            key="cosmetics"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4 min-h-[320px]"
          >
            {/* Badges section */}
            <div className="rounded-xl bg-discord-card/80 border border-white/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Badges</p>
                <p className="text-[9px] text-gray-600 font-mono">{equippedBadges.length}/3 equipped</p>
              </div>
              <p className="text-[10px] text-gray-500">Shown next to your name. Tap to equip/unequip.</p>
              <div className="grid grid-cols-2 gap-2">
                {BADGES.map((badge) => {
                  const isUnlocked = unlockedBadgeIds.includes(badge.id) || (badge.achievementId ? unlockedIds.includes(badge.achievementId) : false)
                  const isEquipped = equippedBadges.includes(badge.id)
                  return (
                    <button
                      key={badge.id}
                      onClick={() => isUnlocked && handleEquipBadge(badge.id)}
                      disabled={!isUnlocked}
                      className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden active:scale-[0.97] ${
                        isEquipped
                          ? 'bg-discord-dark/80'
                          : isUnlocked
                            ? 'border-white/10 bg-discord-dark/50 hover:border-white/20'
                            : 'border-white/[0.06] bg-discord-dark/30'
                      }`}
                      style={{
                        borderColor: isEquipped ? `${badge.color}50` : undefined,
                        boxShadow: isEquipped ? `0 0 20px ${badge.color}20` : undefined,
                      }}
                    >
                      {isEquipped && (
                        <div className="absolute top-1.5 right-1.5">
                          <span className="text-[8px] font-mono font-bold" style={{ color: badge.color }}>ON</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2.5 mb-1">
                        {/* Badge preview — always colorful */}
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0 border"
                          style={{
                            borderColor: `${badge.color}${isUnlocked ? '60' : '30'}`,
                            backgroundColor: `${badge.color}${isUnlocked ? '18' : '0a'}`,
                            boxShadow: isEquipped ? `0 0 12px ${badge.color}40` : `0 0 8px ${badge.color}10`,
                          }}
                        >
                          <span style={{ opacity: isUnlocked ? 1 : 0.6 }}>{badge.icon}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className={`text-[11px] font-semibold block ${isUnlocked ? 'text-white' : 'text-gray-400'}`}>{badge.name}</span>
                          {/* Preview: how badge looks next to name */}
                          <span
                            className="inline-block text-[8px] px-1 py-[1px] rounded font-medium mt-0.5"
                            style={{
                              borderWidth: 1,
                              borderColor: `${badge.color}${isUnlocked ? '40' : '20'}`,
                              backgroundColor: `${badge.color}${isUnlocked ? '15' : '08'}`,
                              color: isUnlocked ? badge.color : `${badge.color}80`,
                            }}
                          >
                            {badge.icon} {badge.label}
                          </span>
                        </div>
                      </div>
                      <p className={`text-[9px] leading-tight ${isUnlocked ? 'text-gray-400' : 'text-gray-500'}`}>{badge.description}</p>
                      {!isUnlocked && (
                        <p className="text-[8px] font-mono mt-0.5" style={{ color: `${badge.color}60` }}>{badge.unlockHint}</p>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Frames section */}
            <div className="rounded-xl bg-discord-card/80 border border-white/10 p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Avatar Frames</p>
              <p className="text-[10px] text-gray-500">Exclusive borders. Tap to equip.</p>
              <div className="grid grid-cols-2 gap-3">
                {FRAMES.map((frame) => {
                  const isUnlocked = unlockedFrameIds.includes(frame.id) || (frame.achievementId ? unlockedIds.includes(frame.achievementId) : false)
                  const isActive = equippedFrameId === frame.id
                  const rarityColors: Record<string, string> = { Rare: '#4FC3F7', Epic: '#C084FC', Legendary: '#FFD700' }
                  const styleClass = `frame-style-${frame.style}`
                  return (
                    <button
                      key={frame.id}
                      onClick={() => isUnlocked && handleEquipFrame(frame.id)}
                      disabled={!isUnlocked}
                      className={`relative p-3 rounded-2xl border text-center transition-all active:scale-[0.96] overflow-hidden ${styleClass} ${
                        isActive
                          ? 'bg-discord-dark/90'
                          : isUnlocked
                            ? 'border-white/10 bg-discord-dark/60 hover:border-white/20'
                            : 'border-white/[0.08] bg-black/55'
                      }`}
                      style={{
                        borderColor: isActive ? `${frame.color}60` : undefined,
                        boxShadow: isActive ? `0 0 25px ${frame.color}30, inset 0 0 20px ${frame.color}08` : (!isUnlocked ? 'inset 0 0 0 1px rgba(255,255,255,0.04)' : undefined),
                        filter: !isUnlocked ? 'grayscale(0.92) saturate(0.35) brightness(0.72)' : undefined,
                      }}
                    >
                      {/* Background gradient wash */}
                      <div
                        className="absolute inset-0 rounded-2xl pointer-events-none"
                        style={{
                          background: frame.gradient,
                          opacity: isActive ? 0.1 : 0.05,
                        }}
                      />
                      {!isUnlocked && (
                        <div className="absolute inset-0 rounded-2xl pointer-events-none bg-black/35" />
                      )}
                      {!isUnlocked && (
                        <span className="absolute top-2 right-2 z-10 text-[8px] px-1.5 py-0.5 rounded-md border border-red-300/35 bg-black/55 text-red-200 font-mono tracking-wide">
                          LOCKED
                        </span>
                      )}

                      {/* Frame avatar preview */}
                      <div className="relative mx-auto w-16 h-16 mb-2">
                        {/* Style-specific animated ring */}
                        <div
                          className="frame-ring absolute -inset-2 rounded-2xl"
                          style={{
                            background: frame.gradient,
                            opacity: isUnlocked ? (isActive ? 0.9 : 0.65) : 0.3,
                            filter: !isUnlocked ? 'saturate(0.4) brightness(0.7)' : undefined,
                            borderColor: frame.color,
                            color: frame.color,
                          }}
                        />
                        {/* Avatar container */}
                        <div
                          className="frame-avatar relative w-16 h-16 rounded-xl bg-discord-darker flex items-center justify-center text-2xl border-2"
                          style={{ borderColor: `${frame.color}${isUnlocked ? 'b0' : '50'}` }}
                        >
                          {avatar}
                        </div>
                        {/* Lock overlay */}
                        {!isUnlocked && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl">
                            <span className="text-xl drop-shadow-lg">🔒</span>
                          </div>
                        )}
                        {/* Equipped checkmark */}
                        {isActive && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: frame.color, color: '#111' }}>
                            ✓
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <p className={`text-[11px] font-bold relative ${isUnlocked ? 'text-white' : 'text-gray-300'}`}>{frame.name}</p>
                      <p className="text-[8px] text-gray-500 relative capitalize">{frame.style}</p>
                      <p
                        className="text-[9px] font-bold uppercase tracking-wider relative"
                        style={{ color: rarityColors[frame.rarity] }}
                      >
                        {frame.rarity === 'Legendary' ? '★ ' : frame.rarity === 'Epic' ? '◆ ' : '● '}{frame.rarity}
                      </p>
                      {!isUnlocked && (
                        <p className="text-[8px] font-mono mt-1 relative text-gray-300/85">{frame.unlockHint}</p>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
