import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ACHIEVEMENTS, getAchievementProgress, type AchievementProgressContext } from '../../lib/xp'
import type { AchievementDef } from '../../lib/xp'
import { useAlertStore } from '../../stores/alertStore'
import { computeTotalSkillLevel, getSkillById, MAX_TOTAL_SKILL_LEVEL, skillLevelFromXP } from '../../lib/skills'
import { playClickSound } from '../../lib/sounds'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { trackMetric } from '../../services/rolloutMetrics'
import { defaultSkillForAchievement } from '../../services/rewardGrant'

const CATEGORY_LABELS: Record<string, string> = {
  grind: '⚡ Grind',
  streak: '🔥 Streak',
  social: '🤝 Social',
  special: '✨ Special',
  skill: '⚡ Skills',
}

export function AchievementsPage() {
  const { user } = useAuthStore()
  const [totalSkillLevel, setTotalSkillLevel] = useState(0)
  const [unlockedIds, setUnlockedIds] = useState<string[]>([])
  const [claimedIds, setClaimedIds] = useState<string[]>([])
  const [progressCtx, setProgressCtx] = useState<AchievementProgressContext>({
    totalSessions: 0,
    streakCount: 0,
    friendCount: 0,
    skillLevels: {},
  })
  const pushAlert = useAlertStore((s) => s.push)

  useEffect(() => {
    // Load from Electron or localStorage
    const api = window.electronAPI
    if (api?.db) {
      api.db.getAllSkillXP?.().then((rows) => {
        const safeRows = (rows || []) as { skill_id: string; total_xp: number }[]
        setTotalSkillLevel(computeTotalSkillLevel(safeRows))
        const levels: Record<string, number> = {}
        for (const row of safeRows) levels[row.skill_id] = skillLevelFromXP(row.total_xp || 0)
        setProgressCtx((prev) => ({ ...prev, skillLevels: levels }))
      })
      api.db.getUnlockedAchievements().then(setUnlockedIds)
      api.db.getSessionCount?.().then((count) => {
        setProgressCtx((prev) => ({ ...prev, totalSessions: Number(count) || 0 }))
      })
      api.db.getStreak?.().then((count) => {
        setProgressCtx((prev) => ({ ...prev, streakCount: Number(count) || 0 }))
      })
    } else {
      const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
      const rows = Object.entries(stored).map(([skill_id, total_xp]) => ({ skill_id, total_xp }))
      setTotalSkillLevel(computeTotalSkillLevel(rows))
      const levels: Record<string, number> = {}
      for (const row of rows) levels[row.skill_id] = skillLevelFromXP(row.total_xp || 0)
      setProgressCtx((prev) => ({ ...prev, skillLevels: levels }))
      const unlocked = JSON.parse(localStorage.getItem('grindly_unlocked_achievements') || '[]')
      setUnlockedIds(unlocked)
    }
    const claimed = JSON.parse(localStorage.getItem('grindly_claimed_achievements') || '[]')
    setClaimedIds(claimed)
  }, [])

  useEffect(() => {
    if (!supabase || !user) return
    let cancelled = false
    ;(async () => {
      const { count } = await supabase
        .from('friendships')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'accepted')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
      if (!cancelled) {
        setProgressCtx((prev) => ({ ...prev, friendCount: count || 0 }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  const handleClaim = (def: AchievementDef) => {
    playClickSound()
    // Mark as claimed
    const updated = [...claimedIds, def.id]
    setClaimedIds(updated)
    localStorage.setItem('grindly_claimed_achievements', JSON.stringify(updated))
    // Show loot drop
    pushAlert(def)
    trackMetric('achievement_claimed')
  }

  const totalUnlocked = ACHIEVEMENTS.filter((a) => unlockedIds.includes(a.id)).length
  const pct = Math.min(100, (totalUnlocked / ACHIEVEMENTS.length) * 100)

  // Group by category
  const categories = ['grind', 'streak', 'social', 'special', 'skill']

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="p-4 pb-2"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">Achievements</h2>
        <div className="text-right">
          <span className="font-mono text-cyber-neon text-sm font-bold">{totalSkillLevel}/{MAX_TOTAL_SKILL_LEVEL}</span>
          <span className="text-gray-500 text-xs ml-2">total level</span>
        </div>
      </div>

      <div className="h-2 rounded-full bg-discord-dark overflow-hidden mb-5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6 }}
          className="h-full bg-gradient-to-r from-cyber-neon to-discord-accent rounded-full"
        />
      </div>

      <div className="space-y-5">
        {categories.map((cat) => {
          const items = ACHIEVEMENTS.filter((a) => a.category === cat)
          if (items.length === 0) return null
          const unlockedCount = items.filter((a) => unlockedIds.includes(a.id)).length
          return (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-gray-400 font-mono uppercase tracking-wider">
                  {CATEGORY_LABELS[cat] || cat}
                </span>
                <span className="text-[10px] text-gray-600 font-mono">{unlockedCount}/{items.length}</span>
              </div>
              <div className="space-y-1.5">
                {items.map((a, i) => {
                  const unlocked = unlockedIds.includes(a.id)
                  const claimed = claimedIds.includes(a.id)
                  const canClaim = unlocked && !claimed && a.reward
                  const progress = getAchievementProgress(a.id, progressCtx)
                  const pctProgress = progress ? Math.min(100, (progress.current / Math.max(1, progress.target)) * 100) : 0
                  return (
                    <motion.div
                      key={a.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className={`flex items-center gap-3 rounded-xl p-3 border ${
                        unlocked
                          ? 'border-cyber-neon/20 bg-cyber-neon/5'
                          : 'border-white/5 bg-discord-dark/50 opacity-40'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 ${
                        unlocked ? 'bg-cyber-neon/15' : 'bg-discord-dark'
                      }`}>
                        {unlocked ? a.icon : '🔒'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${unlocked ? 'text-white' : 'text-gray-400'}`}>
                          {a.name}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{a.description}</p>
                        {progress && (
                          <div className="mt-1.5">
                            <div className="flex items-center justify-between text-[10px] font-mono">
                              <span className={unlocked ? 'text-cyber-neon/70' : 'text-gray-500'}>
                                {progress.label}
                              </span>
                              {progress.complete && (
                                <span className="text-cyber-neon">done</span>
                              )}
                            </div>
                            <div className="h-1 rounded-full bg-discord-darker overflow-hidden mt-1">
                              <div
                                className={`h-full rounded-full ${unlocked ? 'bg-cyber-neon' : 'bg-gray-500/70'}`}
                                style={{ width: `${pctProgress}%` }}
                              />
                            </div>
                          </div>
                        )}
                        {a.reward && unlocked && claimed && (
                          <p className="text-[10px] text-cyber-neon/60 font-mono mt-0.5">
                            {a.reward.value} {a.reward.label}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <span className={`text-xs font-mono ${unlocked ? 'text-cyber-neon' : 'text-gray-600'}`}>
                          +{a.xpReward} xp {(() => { const s = getSkillById(defaultSkillForAchievement(a)); return s ? s.icon : '' })()}
                        </span>
                        {canClaim && (
                          <button
                            onClick={() => handleClaim(a)}
                            className="px-2.5 py-1 rounded-lg bg-cyber-neon text-discord-darker text-[10px] font-bold active:scale-95 transition-all hover:shadow-glow-sm animate-pulse"
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
      </div>
    </motion.div>
  )
}
