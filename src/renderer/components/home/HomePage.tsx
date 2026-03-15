import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ProfileBar } from './ProfileBar'
import { Timer } from './Timer'
import { SessionControls } from './SessionControls'
import { CurrentActivity } from './CurrentActivity'
import { SessionComplete } from './SessionComplete'
import { WelcomeBanner } from './WelcomeBanner'
import { GoalWidget } from './GoalWidget'
import { FocusModeDock } from './FocusModeDock'
import { OrbBlast } from './OrbBlast'
import { useSessionStore } from '../../stores/sessionStore'
import { useAuthStore } from '../../stores/authStore'
import { MOTION } from '../../lib/motion'
import { useNotificationStore } from '../../stores/notificationStore'
import { getDailyActivities, getWeeklyActivities, getQuestStreak } from '../../services/dailyActivityService'

interface HomePageProps {
  onNavigateProfile: () => void
  onNavigateInventory: () => void
  onNavigateFriends?: () => void
}

const APP_LAUNCHED_AT = Date.now()

function formatRecoveryDuration(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function HomePage({ onNavigateProfile, onNavigateInventory, onNavigateFriends }: HomePageProps) {
  const { showComplete, status } = useSessionStore()
  const user = useAuthStore((s) => s.user)
  const pushNotification = useNotificationStore((s) => s.push)
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('grindly_welcomed'))
  const prevStatusRef = useRef(status)
  const notifiedCheckpointUpdatedAtRef = useRef<number | null>(null)
  const [questTick, setQuestTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setQuestTick((v) => v + 1), 30_000)
    return () => clearInterval(interval)
  }, [])

  const { dailyDone, dailyTotal, weeklyDone, weeklyTotal, questStreak } = useMemo(() => {
    const daily = getDailyActivities()
    const weekly = getWeeklyActivities()
    return {
      dailyDone: daily.filter((q) => q.completed).length,
      dailyTotal: daily.length,
      weeklyDone: weekly.filter((q) => q.completed).length,
      weeklyTotal: weekly.length,
      questStreak: getQuestStreak(),
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questTick])

  const showStreakWarning = questStreak > 0 && new Date().getHours() >= 18 && dailyDone < dailyTotal

  useEffect(() => {
    if (status !== 'idle') return
    const api = window.electronAPI
    if (!api?.db?.getCheckpoint) return
    api.db.getCheckpoint().then((cp) => {
      const belongsToPreviousRun = !!cp && cp.updated_at < (APP_LAUNCHED_AT - 5000)
      if (cp && cp.elapsed_seconds >= 60 && belongsToPreviousRun) {
        if (notifiedCheckpointUpdatedAtRef.current === cp.updated_at) return
        notifiedCheckpointUpdatedAtRef.current = cp.updated_at
        let parsedSkillXP: Record<string, number> = {}
        try {
          const raw = cp.session_skill_xp ? JSON.parse(cp.session_skill_xp) : {}
          if (raw && typeof raw === 'object') {
            parsedSkillXP = Object.fromEntries(
              Object.entries(raw as Record<string, unknown>).filter(([, value]) => typeof value === 'number' && value > 0),
            ) as Record<string, number>
          }
        } catch {
          parsedSkillXP = {}
        }
        pushNotification({
          type: 'progression',
          icon: '🌱',
          title: 'Session restored',
          body: `Last run lasted ${formatRecoveryDuration(cp.elapsed_seconds)}. Your progress is safe and ready to claim.`,
          recovery: {
            sessionId: cp.session_id,
            startTime: cp.start_time,
            elapsedSeconds: cp.elapsed_seconds,
            sessionSkillXP: parsedSkillXP,
          },
        })
      }
    }).catch(() => {})
  }, [status, pushNotification])

  useEffect(() => {
    const welcomed = localStorage.getItem('grindly_welcomed')
    if (!welcomed) setShowWelcome(true)
  }, [])

  // Dismiss welcome when GRIND is pressed (status transitions from idle → running)
  useEffect(() => {
    const wasIdle = prevStatusRef.current === 'idle'
    prevStatusRef.current = status

    if (wasIdle && status === 'running' && showWelcome) {
      localStorage.setItem('grindly_welcomed', '1')
      setShowWelcome(false)
    }
  }, [status, showWelcome])

  const welcomeVisible = showWelcome && status === 'idle'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: MOTION.duration.slow, ease: MOTION.easingSoft }}
      className="relative flex flex-col h-full"
    >
      <OrbBlast />

      <ProfileBar onNavigateProfile={onNavigateProfile} onNavigateInventory={onNavigateInventory} />

      {/* Welcome banner — only for new users, before first grind */}
      <AnimatePresence>
        {welcomeVisible && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: MOTION.easingSoft }}
            className="flex justify-center px-4 pt-2"
          >
            <WelcomeBanner />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Center zone — Timer + Controls at true screen center */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-6">
        <Timer />

        <div className="flex flex-col items-center gap-5">
          <SessionControls glowPulse={showWelcome && status === 'idle'} />
          <AnimatePresence>
            {status !== 'idle' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: MOTION.duration.verySlow, ease: MOTION.easingSoft }}
                className="flex flex-col items-center gap-3"
              >
                <CurrentActivity />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom zone — Goal + Focus anchored at bottom */}
      <div className="flex flex-col items-center px-4 pb-4 w-full">
        <div className="w-full max-w-xs space-y-2">
          {showStreakWarning && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/[0.07] border border-amber-500/20">
              <span className="shrink-0">🔥</span>
              <span className="text-[10px] font-mono text-amber-500/80 leading-snug">
                Maintain your streak — {dailyTotal - dailyDone} quest{dailyTotal - dailyDone !== 1 ? 's' : ''} left, resets at midnight
              </span>
            </div>
          )}
          {dailyTotal > 0 && (
            <div className="flex items-center gap-2 px-0.5">
              <span className="text-[10px] font-mono text-gray-600 shrink-0 w-10">Daily</span>
              <div className="flex gap-0.5 flex-1">
                {Array.from({ length: dailyTotal }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                      i < dailyDone ? 'bg-cyber-neon' : 'bg-white/[0.08]'
                    }`}
                  />
                ))}
              </div>
              <span className={`text-[10px] font-mono shrink-0 tabular-nums ${
                dailyDone === dailyTotal ? 'text-cyber-neon' : 'text-gray-600'
              }`}>
                {dailyDone}/{dailyTotal}
              </span>
            </div>
          )}
          {weeklyTotal > 0 && (
            <div className="flex items-center gap-2 px-0.5">
              <span className="text-[10px] font-mono text-gray-600 shrink-0 w-10">Weekly</span>
              <div className="flex gap-0.5 flex-1">
                {Array.from({ length: weeklyTotal }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                      i < weeklyDone ? 'bg-discord-purple' : 'bg-white/[0.08]'
                    }`}
                  />
                ))}
              </div>
              <span className={`text-[10px] font-mono shrink-0 tabular-nums ${
                weeklyDone === weeklyTotal ? 'text-discord-purple' : 'text-gray-600'
              }`}>
                {weeklyDone}/{weeklyTotal}
              </span>
            </div>
          )}
          <GoalWidget trailingAction={<FocusModeDock />} />
        </div>
      </div>

      <AnimatePresence>
        {showComplete && (
          <SessionComplete
            onNavigateFriends={onNavigateFriends}
          />
        )}
      </AnimatePresence>

    </motion.div>
  )
}
