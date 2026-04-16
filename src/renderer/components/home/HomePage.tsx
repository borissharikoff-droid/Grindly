import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight } from '../../lib/icons'
import { ProfileBar } from './ProfileBar'
import { StreakBar } from './StreakBar'
import { Timer } from './Timer'
import { SessionControls } from './SessionControls'
import { CurrentActivity } from './CurrentActivity'
import { SessionComplete } from './SessionComplete'
import { WelcomeBanner } from './WelcomeBanner'
import { GoalWidget } from './GoalWidget'
import { FocusModeDock } from './FocusModeDock'
import { TodayWidget } from './TodayWidget'
import { OrbBlast } from './OrbBlast'
import { useSessionStore } from '../../stores/sessionStore'
import { MOTION } from '../../lib/motion'
import { useNotificationStore } from '../../stores/notificationStore'
import { getQuestStreak } from '../../services/dailyActivityService'
import { useBountyStore } from '../../stores/bountyStore'
import { useWeeklyStore } from '../../stores/weeklyStore'
import { useCraftingStore } from '../../stores/craftingStore'
import { useCookingStore } from '../../stores/cookingStore'
import { useFarmStore } from '../../stores/farmStore'
import { useNavigationStore } from '../../stores/navigationStore'
import { useRaidStore } from '../../stores/raidStore'
import { RAID_TIER_CONFIGS, getRaidPhase } from '../../services/raidService'
import { usePetStore } from '../../stores/petStore'
import { ADVENTURES, computeCurrentHunger, computePetMood, getPetDef, getPetLevelImage, getPetBuffDisplay, MOOD_EMOJI } from '../../lib/pets'

interface HomePageProps {
  onNavigateProfile: () => void
  onNavigateInventory: () => void
  onNavigateFriends?: () => void
  hasFriends?: boolean
}

const APP_LAUNCHED_AT = Date.now()

function jobRemainingItems(now: number, startedAt: number, secPerItem: number, totalQty: number, doneQty: number): number {
  const elapsed = (now - startedAt) / 1000
  return Math.max(0, totalQty - doneQty - Math.floor(elapsed / secPerItem))
}

function formatRecoveryDuration(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function raidCountdown(dateStr: string | null): string {
  if (!dateStr) return ''
  const ms = new Date(dateStr).getTime() - Date.now()
  if (ms <= 0) return 'Ended'
  const d = Math.floor(ms / 86_400_000)
  const h = Math.floor((ms % 86_400_000) / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (d > 0) return `${d}d ${h}h left`
  if (h > 0) return `${h}h ${m}m left`
  return `${m}m left`
}

export function HomePage({ onNavigateProfile, onNavigateInventory, onNavigateFriends, hasFriends }: HomePageProps) {
  const showComplete = useSessionStore((s) => s.showComplete)
  const status = useSessionStore((s) => s.status)
  const sessionId = useSessionStore((s) => s.sessionId) // changes each new session
  const pushNotification = useNotificationStore((s) => s.push)
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('grindly_welcomed'))
  const prevStatusRef = useRef(status)
  const notifiedCheckpointUpdatedAtRef = useRef<number | null>(null)
  // Ambient activity bar — refresh every 15s
  const [ambientTick, setAmbientTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setAmbientTick((t) => t + 1), 15_000)
    return () => clearInterval(id)
  }, [])
  const craftJob = useCraftingStore((s) => s.activeJob)
  const cookJob = useCookingStore((s) => s.activeJob)
  const planted = useFarmStore((s) => s.planted)
  const navigateTo = useNavigationStore((s) => s.navigateTo)
  const setProfileInitialTab = useNavigationStore((s) => s.setProfileInitialTab)
  const activeRaid = useRaidStore((s) => s.activeRaid)

  const now = Date.now() + ambientTick * 0
  const farmSlots = Object.values(planted).filter((s) => !!s) as import('../../stores/farmStore').PlantedSlot[]
  const farmReady = farmSlots.filter((s) => (now - s.plantedAt) / 1000 >= s.growTimeSeconds).length
  const farmGrowingSlots = farmSlots.filter((s) => (now - s.plantedAt) / 1000 < s.growTimeSeconds)
  const farmGrowing = farmGrowingSlots.length
  const farmNearestRemainingMs = farmGrowing > 0
    ? Math.min(...farmGrowingSlots.map((s) => Math.max(0, s.growTimeSeconds * 1000 - (now - s.plantedAt))))
    : 0
  const farmGrowingProgress = farmGrowing > 0
    ? farmGrowingSlots.reduce((sum, s) => sum + Math.min(1, (now - s.plantedAt) / 1000 / s.growTimeSeconds), 0) / farmGrowing
    : 0

  const craftRemaining = craftJob ? jobRemainingItems(now, craftJob.startedAt, craftJob.secPerItem, craftJob.totalQty, craftJob.doneQty) : 0
  const cookRemaining = cookJob ? jobRemainingItems(now, cookJob.startedAt, cookJob.secPerItem, cookJob.totalQty, cookJob.doneQty) : 0
  const activePet = usePetStore((s) => s.activePet)
  const petAdventure = activePet?.adventureId
    ? ADVENTURES.find((a) => a.id === activePet.adventureId) ?? null
    : null
  const petAdventureElapsed = petAdventure && activePet?.adventureStartedAt
    ? now - activePet.adventureStartedAt
    : 0
  const petAdventureDone = petAdventure ? petAdventureElapsed >= petAdventure.durationMs : false
  const petAdventureRemaining = petAdventure ? Math.max(0, petAdventure.durationMs - petAdventureElapsed) : 0
  const petAdventureProgress = petAdventure ? Math.min(1, petAdventureElapsed / petAdventure.durationMs) : 0

  const showAmbientBar = farmReady > 0 || farmGrowing > 0 || !!craftJob || !!cookJob || !!petAdventure

  const raidCfg = activeRaid ? RAID_TIER_CONFIGS[activeRaid.tier] : null
  const raidPhase = activeRaid ? getRaidPhase(activeRaid.boss_hp_remaining, activeRaid.boss_hp_max) : 1
  const raidHpPct = activeRaid ? (activeRaid.boss_hp_remaining / activeRaid.boss_hp_max) * 100 : 0
  const raidCountdownStr = activeRaid ? raidCountdown(activeRaid.ends_at) : ''

  const bounties = useBountyStore((s) => s.bounties)
  const weeklyBounties = useWeeklyStore((s) => s.bounties)
  const dailyDone = bounties.filter((b) => b.progress >= b.targetCount).length
  const dailyTotal = bounties.length
  const weeklyDone = weeklyBounties.filter((b) => b.progress >= b.targetCount).length
  const weeklyTotal = weeklyBounties.length
  const questStreak = getQuestStreak()


  const handleOpenQuests = () => {
    setProfileInitialTab('quests')
    onNavigateProfile()
  }

  // Checkpoint-based "Session restored" notification. Fires both on first
  // mount (fresh app launch after crash) AND on tray → show reopen (window
  // came back from hidden). The cutoff is the most recent of app launch or
  // last reopen: any checkpoint updated before that cutoff belongs to a
  // previous run and we notify.
  const cutoffRef = useRef<number>(APP_LAUNCHED_AT)
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.db?.getCheckpoint) return

    const checkCheckpoint = () => {
      api.db.getCheckpoint().then((cp) => {
        const belongsToPreviousRun = !!cp && cp.updated_at < (cutoffRef.current - 5000)
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
          let parsedActivities: unknown[] | undefined
          try {
            const raw = cp.session_activities ? JSON.parse(cp.session_activities) : null
            if (Array.isArray(raw) && raw.length > 0) parsedActivities = raw
          } catch { /* ignore */ }
          pushNotification({
            type: 'progression',
            icon: '🌱',
            title: 'Session restored',
            body: `Last run lasted ${formatRecoveryDuration(cp.elapsed_seconds)}. Your progress is safe and ready to claim.`,
            timestamp: cp.updated_at,
            recovery: {
              sessionId: cp.session_id,
              startTime: cp.start_time,
              elapsedSeconds: cp.elapsed_seconds,
              sessionSkillXP: parsedSkillXP,
              sessionActivities: parsedActivities,
            },
          })
        }
      }).catch(() => {})
    }

    // Initial check on mount (only meaningful when idle)
    if (status === 'idle') checkCheckpoint()

    // Re-check when window comes back from tray. Bump the cutoff so a
    // checkpoint flushed while hidden counts as "previous run". Also clear
    // the notify-once ref so the same checkpoint can surface again after a
    // later reopen if still unclaimed.
    const off = window.electronAPI?.window?.onReopened?.((reopenedAt) => {
      cutoffRef.current = reopenedAt
      notifiedCheckpointUpdatedAtRef.current = null
      checkCheckpoint()
    })
    return () => { off?.() }
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
      <StreakBar sessionVersion={sessionId ?? undefined} />

      {/* Active raid ambient bar */}
      {activeRaid && raidCfg && activeRaid.status === 'active' && (
        <div
          className="mx-4 mt-2 mb-0 rounded border border-white/[0.08] bg-white/[0.03] px-3 py-2 flex items-center gap-2"
        >
          <span className="text-base shrink-0">{raidCfg.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white/90 truncate">{raidCfg.name}</p>
            <p className="text-micro font-mono text-gray-500 mt-0.5">{raidCountdownStr} — Phase {raidPhase}</p>
          </div>
          <span className="text-micro font-mono text-gray-400 shrink-0 tabular-nums">
            {raidHpPct.toFixed(0)}% HP
          </span>
          <button
            type="button"
            onClick={() => navigateTo?.('arena')}
            className="shrink-0 text-micro font-mono px-2 py-1 rounded border border-white/12 bg-white/[0.04] text-gray-300 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            →
          </button>
        </div>
      )}

      {/* Center zone — Timer + Controls, bottom zone pinned to nav */}
      <div className="flex-1 flex flex-col px-4">
        {/* Timer centered in remaining space */}
        <div className="flex-1 flex flex-col items-center justify-center gap-6 pb-8">
          {/* Welcome banner — only for new users, before first grind */}
          <AnimatePresence>
            {welcomeVisible && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3, ease: MOTION.easingSoft }}
              >
                <WelcomeBanner />
              </motion.div>
            )}
          </AnimatePresence>
          <Timer />

          <div className="flex flex-col items-center gap-4">
            <SessionControls />
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

        {/* Bottom zone — pinned just above nav bar */}
        <div className="pb-4 w-full max-w-sm mx-auto space-y-2">

          {/* Pet idle widget — visible when not in a session */}
          {status === 'idle' && activePet && !activePet.adventureId && (() => {
            const def = getPetDef(activePet.defId)
            if (!def) return null
            const hunger = computeCurrentHunger(activePet)
            const mood = computePetMood(activePet)
            const levelImg = getPetLevelImage(activePet.defId, activePet.level)
            const displayEmoji = activePet.hasEvolvedEmoji && def.evolvedEmoji ? def.evolvedEmoji : def.emoji
            const petName = activePet.customName ?? def.name
            const hungerColor = hunger === 0 ? 'bg-gray-600' : hunger < 25 ? 'bg-red-500' : hunger < 50 ? 'bg-amber-500' : 'bg-lime-500'
            const buffDisplay = getPetBuffDisplay(activePet)
            return (
              <button
                type="button"
                onClick={() => navigateTo?.('pet')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-surface-1/60 border border-white/[0.06] hover:bg-surface-1 transition-colors"
              >
                <div className="shrink-0 w-7 h-7 flex items-center justify-center">
                  {levelImg
                    ? <img src={levelImg} alt="" className="w-7 h-7 object-contain" draggable={false} />
                    : <span className="text-lg leading-none">{displayEmoji}</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-white truncate">
                      {MOOD_EMOJI[mood]} {petName}
                    </span>
                    <div className="flex items-center gap-2 shrink-0 ml-1">
                      {hunger > 0 && (
                        <span className="text-micro font-mono text-lime-400">{buffDisplay}</span>
                      )}
                      <span className={`text-micro font-mono ${hunger < 25 ? 'text-red-400' : 'text-gray-500'}`}>
                        🍗 {hunger}%
                      </span>
                    </div>
                  </div>
                  <div className="h-1 rounded-full bg-surface-0 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${hungerColor}`}
                      style={{ width: `${hunger}%` }}
                    />
                  </div>
                </div>
              </button>
            )
          })()}

          {/* Ambient activity bar — farm/craft/cook status */}
          {showAmbientBar && (
            <div className="flex gap-1.5 flex-wrap">
              {farmReady > 0 && (
                <button
                  type="button"
                  onClick={() => navigateTo?.('farm')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-micro font-mono border border-lime-500/35 bg-lime-500/[0.07] text-lime-400 hover:bg-lime-500/12 transition-colors"
                >
                  🌾 {farmReady} ready
                </button>
              )}
              {farmGrowing > 0 && (
                <button
                  type="button"
                  onClick={() => navigateTo?.('farm')}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-micro font-mono border border-white/12 bg-white/[0.04] text-gray-400 hover:bg-white/[0.07] transition-colors"
                >
                  🌱
                  <span className="flex items-center gap-1">
                    <span className="w-10 h-1 rounded-full bg-white/[0.08] overflow-hidden inline-block relative">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-lime-500/60"
                        style={{ width: `${farmGrowingProgress * 100}%` }}
                      />
                    </span>
                    {Math.floor(farmNearestRemainingMs / 3_600_000) > 0
                      ? `${Math.floor(farmNearestRemainingMs / 3_600_000)}h${Math.floor((farmNearestRemainingMs % 3_600_000) / 60_000)}m`
                      : `${Math.floor(farmNearestRemainingMs / 60_000)}m`}
                  </span>
                </button>
              )}
              {craftJob && (
                <button
                  type="button"
                  onClick={() => navigateTo?.('craft')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-micro font-mono border transition-colors ${
                    craftRemaining === 0
                      ? 'border-lime-500/35 bg-lime-500/[0.07] text-lime-400 hover:bg-lime-500/12'
                      : 'border-white/12 bg-white/[0.04] text-gray-400 hover:bg-white/[0.07]'
                  }`}
                >
                  ⚒ {craftRemaining === 0 ? 'done' : `${craftRemaining} left`}
                </button>
              )}
              {cookJob && (
                <button
                  type="button"
                  onClick={() => navigateTo?.('cooking')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-micro font-mono border transition-colors ${
                    cookRemaining === 0
                      ? 'border-lime-500/35 bg-lime-500/[0.07] text-lime-400 hover:bg-lime-500/12'
                      : 'border-white/12 bg-white/[0.04] text-gray-400 hover:bg-white/[0.07]'
                  }`}
                >
                  🍳 {cookRemaining === 0 ? 'done' : `${cookRemaining} left`}
                </button>
              )}
              {petAdventure && (
                <button
                  type="button"
                  onClick={() => navigateTo?.('pet')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-micro font-mono border transition-colors ${
                    petAdventureDone
                      ? 'border-lime-500/35 bg-lime-500/[0.07] text-lime-400 hover:bg-lime-500/12'
                      : 'border-white/12 bg-white/[0.04] text-gray-400 hover:bg-white/[0.07]'
                  }`}
                >
                  {petAdventure.icon}
                  {petAdventureDone ? (
                    'collect!'
                  ) : (
                    <span className="flex items-center gap-1">
                      <span className="w-10 h-1 rounded-full bg-white/[0.08] overflow-hidden inline-block relative">
                        <span
                          className="absolute inset-y-0 left-0 rounded-full bg-blue-500/60"
                          style={{ width: `${petAdventureProgress * 100}%` }}
                        />
                      </span>
                      {Math.floor(petAdventureRemaining / 3_600_000)}h{Math.floor((petAdventureRemaining % 3_600_000) / 60_000)}m
                    </span>
                  )}
                </button>
              )}
            </div>
          )}


          {(dailyTotal > 0 || weeklyTotal > 0) && (
            <button type="button" onClick={handleOpenQuests} className="w-full group rounded border border-white/[0.06] hover:border-white/[0.12] px-3 py-2 hover:bg-white/[0.03] transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className="text-micro font-mono text-gray-400 uppercase tracking-widest">Quests</span>
                <ChevronRight className="w-3 h-3 text-gray-500 group-hover:text-gray-300 transition-colors shrink-0" />
              </div>
              {dailyTotal > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-500 group-hover:text-gray-300 transition-colors shrink-0 w-12">Daily</span>
                  <div className="flex gap-0.5 flex-1">
                    {Array.from({ length: dailyTotal }).map((_, i) => (
                      <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i < dailyDone ? 'bg-accent' : 'bg-white/[0.08]'}`} />
                    ))}
                  </div>
                  <span className={`text-xs font-mono shrink-0 tabular-nums ${dailyDone === dailyTotal ? 'text-accent' : 'text-gray-400'}`}>{dailyDone}/{dailyTotal}</span>
                </div>
              )}
              {weeklyTotal > 0 && (
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs font-mono text-gray-500 group-hover:text-gray-300 transition-colors shrink-0 w-12">Weekly</span>
                  <div className="flex gap-0.5 flex-1">
                    {Array.from({ length: weeklyTotal }).map((_, i) => (
                      <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i < weeklyDone ? 'bg-violet-500' : 'bg-white/[0.08]'}`} />
                    ))}
                  </div>
                  <span className={`text-xs font-mono shrink-0 tabular-nums ${weeklyDone === weeklyTotal ? 'text-violet-500' : 'text-gray-400'}`}>{weeklyDone}/{weeklyTotal}</span>
                </div>
              )}
            </button>
          )}
          <GoalWidget trailingAction={<FocusModeDock />} />
          {status === 'idle' && (
            <TodayWidget onOpenStats={() => navigateTo?.('stats')} />
          )}
        </div>
      </div>

      <AnimatePresence>
        {showComplete && (
          <SessionComplete
            onNavigateFriends={onNavigateFriends}
            hasFriends={hasFriends}
          />
        )}
      </AnimatePresence>

    </motion.div>
  )
}
