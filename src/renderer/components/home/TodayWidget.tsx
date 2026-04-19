import { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { getSkillById, computeTotalSkillLevel } from '../../lib/skills'
import { useSessionStore } from '../../stores/sessionStore'
import { useAuthStore } from '../../stores/authStore'
import { TodayShareModal } from './TodayShareModal'
import { playClickSound } from '../../lib/sounds'
import { supabase } from '../../lib/supabase'

interface TodayRecap {
  totalSeconds: number
  sessionCount: number
  topSkill: { skill_id: string; xp: number } | null
  totalXP: number
  skills?: { skill_id: string; xp: number }[]
  keystrokes?: number
  focusedSeconds?: number
  distractedSeconds?: number
  longestSessionSeconds?: number
  topApp?: { app_name: string; seconds: number } | null
  topApps?: { app_name: string; category: string | null; seconds: number }[]
}

interface Identity {
  avatar: string | null
  level: number
  streak: number
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0m'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatXP(xp: number): string {
  if (xp >= 1000) return `${(xp / 1000).toFixed(1)}k`
  return Math.round(xp).toLocaleString()
}

interface Props {
  onOpenStats?: () => void
}

export function TodayWidget({ onOpenStats }: Props) {
  const [recap, setRecap] = useState<TodayRecap | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const lastSessionSavedAt = useSessionStore((s) => s.lastSessionSavedAt)
  const sessionStatus = useSessionStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const username = (user?.user_metadata as { username?: string } | undefined)?.username || null
  const [identity, setIdentity] = useState<Identity>({ avatar: null, level: 0, streak: 0 })

  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setRefreshing(true)
    try {
      const api = window.electronAPI?.db
      if (!api?.getTodayRecap) { setLoading(false); return }
      const data = await api.getTodayRecap()
      setRecap(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load({ silent: true })
    const id = setInterval(() => load({ silent: true }), 60_000)
    return () => clearInterval(id)
  }, [load])

  // Pull identity bits (avatar, total level, streak) so the share card has personality.
  useEffect(() => {
    if (!user) return
    const api = window.electronAPI?.db
    let cancelled = false

    // Avatar from profiles (or cache)
    const cached = (() => {
      try {
        return JSON.parse(localStorage.getItem(`grindly_profile_cache_${user.id}`) || '{}') as { avatar?: string }
      } catch { return {} }
    })()
    if (cached.avatar) setIdentity((p) => ({ ...p, avatar: cached.avatar || null }))
    if (supabase) {
      void Promise.resolve(
        supabase.from('profiles').select('avatar_url').eq('id', user.id).single()
      ).then(({ data }) => {
        if (cancelled || !data) return
        setIdentity((p) => ({ ...p, avatar: (data.avatar_url as string | null) || p.avatar }))
      }).catch(() => {})
    }
    if (api?.getStreak) {
      api.getStreak().then((s: number) => { if (!cancelled) setIdentity((p) => ({ ...p, streak: s || 0 })) }).catch(() => {})
    }
    if (api?.getAllSkillXP) {
      api.getAllSkillXP().then((rows: { skill_id: string; total_xp: number }[]) => {
        if (cancelled) return
        setIdentity((p) => ({ ...p, level: computeTotalSkillLevel(rows || []) }))
      }).catch(() => {})
    }
    return () => { cancelled = true }
  }, [user])

  // Show "Saving…" the instant session status flips to idle, so the user sees
  // feedback during the gap between Stop click and the SQLite/XP write finishing.
  const prevStatus = useRef<string>(sessionStatus)
  useEffect(() => {
    const wasActive = prevStatus.current === 'running' || prevStatus.current === 'paused'
    if (wasActive && sessionStatus === 'idle') setSaving(true)
    prevStatus.current = sessionStatus
  }, [sessionStatus])

  // When the session is fully persisted (row + skill XP), reload and drop the saving state.
  const lastSeenSavedAt = useRef<number | null>(lastSessionSavedAt)
  useEffect(() => {
    if (lastSessionSavedAt === null) return
    if (lastSeenSavedAt.current === lastSessionSavedAt) return
    lastSeenSavedAt.current = lastSessionSavedAt
    load().finally(() => setSaving(false))
  }, [lastSessionSavedAt, load])

  if (loading || !recap) return null

  const hasActivity = recap.sessionCount > 0 || recap.totalSeconds > 0
  const handleClick = () => {
    if (onOpenStats) onOpenStats()
  }
  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation()
    playClickSound()
    setShareOpen(true)
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        onClick={handleClick}
        className={`rounded-xl border border-discord-border bg-discord-darker/60 px-4 py-3 ${onOpenStats ? 'cursor-pointer hover:bg-discord-darker hover:border-discord-primary/40 transition-colors' : ''}`}
        role={onOpenStats ? 'button' : undefined}
        tabIndex={onOpenStats ? 0 : undefined}
        onKeyDown={(e) => {
          if (onOpenStats && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            onOpenStats()
          }
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-discord-muted font-semibold">
              Today
            </div>
            {(refreshing || saving) && (
              <span className="text-[10px] text-accent/80 font-mono animate-pulse">
                {saving ? 'Saving session…' : 'Updating…'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {hasActivity && (
              <button
                type="button"
                onClick={handleShare}
                onKeyDown={(e) => e.stopPropagation()}
                className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-accent hover:text-white bg-accent/15 hover:bg-accent/30 border border-accent/40 hover:border-accent/70 transition-colors px-2 py-1 rounded-md"
                title="Share today's summary"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                Share
              </button>
            )}
            {onOpenStats && (
              <div className="text-[10px] text-discord-muted px-1">Stats →</div>
            )}
          </div>
        </div>

        {!hasActivity ? (
          <div className="text-sm text-discord-muted">
            No sessions yet today. Start a grind to light it up.
          </div>
        ) : (
          <div className={`space-y-2.5 transition-opacity ${saving ? 'opacity-50' : ''}`}>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-lg font-bold text-discord-text leading-none">
                  {formatDuration(recap.totalSeconds)}
                </div>
                <div className="text-[10px] text-discord-muted mt-1 uppercase tracking-wider">
                  Time
                </div>
              </div>

              <div>
                <div className="text-lg font-bold text-discord-text leading-none">
                  {recap.sessionCount}
                </div>
                <div className="text-[10px] text-discord-muted mt-1 uppercase tracking-wider">
                  Session{recap.sessionCount === 1 ? '' : 's'}
                </div>
              </div>

              <div className="min-w-0">
                {recap.topApp && recap.topApp.seconds >= 60 ? (
                  <>
                    <div className="text-sm font-bold text-discord-text leading-none truncate" title={recap.topApp.app_name}>
                      {recap.topApp.app_name.replace(/\.exe$/i, '')}
                    </div>
                    <div className="text-[10px] text-discord-muted mt-1 uppercase tracking-wider">
                      Top app · {formatDuration(recap.topApp.seconds)}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-lg font-bold text-discord-text leading-none">
                      {formatXP(recap.totalXP)}
                    </div>
                    <div className="text-[10px] text-discord-muted mt-1 uppercase tracking-wider">
                      Total XP
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Top skills strip */}
            {recap.skills && recap.skills.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-white/5">
                {recap.skills.slice(0, 3).map((s) => {
                  const def = getSkillById(s.skill_id)
                  if (!def) return null
                  return (
                    <div
                      key={s.skill_id}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-md border"
                      style={{
                        borderColor: `${def.color}40`,
                        backgroundColor: `${def.color}14`,
                      }}
                      title={`${def.name} +${Math.round(s.xp).toLocaleString()} XP today`}
                    >
                      <span className="text-xs leading-none">{def.icon}</span>
                      <span className="text-[11px] font-bold leading-none" style={{ color: def.color }}>
                        +{formatXP(s.xp)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </motion.div>

      {shareOpen && (
        <TodayShareModal
          input={{
            totalSeconds: recap.totalSeconds,
            sessionCount: recap.sessionCount,
            topSkill: recap.topSkill,
            totalXP: recap.totalXP,
            username,
            avatar: identity.avatar,
            level: identity.level,
            streak: identity.streak,
            skills: recap.skills,
            keystrokes: recap.keystrokes,
            focusedSeconds: recap.focusedSeconds,
            distractedSeconds: recap.distractedSeconds,
            longestSessionSeconds: recap.longestSessionSeconds,
            topApp: recap.topApp,
            topApps: recap.topApps,
          }}
          onClose={() => setShareOpen(false)}
        />
      )}
    </>
  )
}
