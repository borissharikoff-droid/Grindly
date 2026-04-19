import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MOTION } from '../../lib/motion'
import type { TabId } from '../../App'
import { useSessionStore } from '../../stores/sessionStore'
import { useInventoryStore } from '../../stores/inventoryStore'
import { useChestDropStore } from '../../stores/chestDropStore'
import { SKILLS } from '../../lib/skills'
import { track } from '../../lib/analytics'

// ── Phase order ──────────────────────────────────────────────────────────────

type TourPhase =
  | 'press_grind'     // waiting for user to press GRIND
  | 'grind_running'   // session live, XP drip + countdown to chest
  | 'show_inventory'  // chest opened, navigate to inventory, explain equip
  | 'show_arena'      // navigate to arena, explain zones
  | 'stop_session'    // waiting for user to press STOP
  | 'celebrate'       // mini-report with real stats

const PHASES: TourPhase[] = [
  'press_grind',
  'grind_running',
  'show_inventory',
  'show_arena',
  'stop_session',
  'celebrate',
]

// ── Card content ─────────────────────────────────────────────────────────────

interface CardContent {
  title: string
  desc: string
  action?: string
  nextPhase?: TourPhase
  showSkip?: boolean
}

const CONTENT: Record<TourPhase, CardContent> = {
  press_grind: {
    title: 'Start your first session',
    desc: 'Press the big GRIND button — it starts tracking your focus time and XP automatically.',
    showSkip: true,
  },
  grind_running: {
    title: 'Session live!',
    desc: 'XP drips live while you work. Your first loot is incoming…',
    showSkip: true,
  },
  show_inventory: {
    title: 'Your loot is in the bag',
    desc: 'Tap any item to inspect it. Press Equip to put it on — gear adds ATK, HP and DEF for the Arena.',
    action: 'Got it →',
    nextPhase: 'show_arena',
  },
  show_arena: {
    title: 'The Arena',
    desc: 'Pick a zone, fight 3 mobs, then the boss. Bosses drop rare materials and legendary chests. Harder zones need better gear.',
    action: 'Got it →',
    nextPhase: 'stop_session',
  },
  stop_session: {
    title: 'Stop your session',
    desc: 'Press the STOP button to end the session. All your XP, skill progress and loot will be saved.',
  },
  celebrate: {
    title: 'You\'re all set!',
    desc: '',
    action: 'Start grinding!',
  },
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onNavigate: (tab: TabId) => void
  onDone: () => void
  onStepChange?: (step: number) => void
}

const CHEST_DELAY_SECS = 10
const XP_TICK_EVERY_MS = 2200

interface XpFloater {
  id: number
  xp: number
  skillId: string
  color: string
  label: string
  xOffset: number
}

function pickPrimarySkillId(): string {
  try {
    const raw = localStorage.getItem('grindly_primary_skills')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
        return parsed[0]
      }
    }
  } catch {}
  return 'developer'
}

export function OnboardingTour({ onNavigate, onDone, onStepChange }: Props) {
  const [phase, setPhase] = useState<TourPhase>('press_grind')
  const [countdown, setCountdown] = useState(CHEST_DELAY_SECS)
  const [floaters, setFloaters] = useState<XpFloater[]>([])
  const sessionStatus = useSessionStore(s => s.status)
  const lastSessionSummary = useSessionStore(s => s.lastSessionSummary)
  const sessionSkillXPEarned = useSessionStore(s => s.sessionSkillXPEarned)
  const skillXPGains = useSessionStore(s => s.skillXPGains)
  const chestQueueLen = useChestDropStore(s => s.queue.length)
  const chestGranted = useRef(false)
  const floaterId = useRef(0)
  const floaterRemovalTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  const primarySkillId = useMemo(() => pickPrimarySkillId(), [])
  const primarySkill = useMemo(
    () => SKILLS.find(s => s.id === primarySkillId) ?? SKILLS[0],
    [primarySkillId],
  )

  function goTo(p: TourPhase) {
    setPhase(p)
    onStepChange?.(PHASES.indexOf(p))
  }

  // ── Auto-advance: press_grind → grind_running ─────────────────────────────
  useEffect(() => {
    if (phase === 'press_grind' && sessionStatus === 'running') {
      goTo('grind_running')
      setCountdown(CHEST_DELAY_SECS)
      chestGranted.current = false
    }
  }, [phase, sessionStatus])

  // ── Countdown tick (grind_running) ────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'grind_running') return
    const id = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000)
    return () => clearInterval(id)
  }, [phase])

  // ── Floating +XP drip during grind_running ────────────────────────────────
  useEffect(() => {
    if (phase !== 'grind_running') return
    const removalSet = floaterRemovalTimers.current
    const spawn = () => {
      const id = ++floaterId.current
      const xp = 2 + Math.floor(Math.random() * 6) // 2-7 XP
      const xOffset = (Math.random() - 0.5) * 90
      setFloaters(prev => [
        ...prev,
        { id, xp, skillId: primarySkill.id, color: primarySkill.color, label: primarySkill.name, xOffset },
      ])
      const removal = setTimeout(() => {
        removalSet.delete(removal)
        setFloaters(prev => prev.filter(f => f.id !== id))
      }, 2000)
      removalSet.add(removal)
    }
    const firstTimer = setTimeout(spawn, 400)
    const interval = setInterval(spawn, XP_TICK_EVERY_MS)
    return () => {
      clearTimeout(firstTimer)
      clearInterval(interval)
      removalSet.forEach(t => clearTimeout(t))
      removalSet.clear()
      setFloaters([])
    }
  }, [phase, primarySkill])

  // ── Countdown hit 0 → enqueue first chest ─────────────────────────────────
  useEffect(() => {
    if (phase === 'grind_running' && countdown === 0 && !chestGranted.current) {
      chestGranted.current = true
      localStorage.removeItem('grindly_first_chest_pending')
      try {
        track('onboarding_first_chest_dropped')
      } catch {}
      const result = useInventoryStore.getState().rollSessionChestDrop({
        source: 'skill_grind',
        focusCategory: primarySkill.category,
      })
      useChestDropStore.getState().enqueue(result.rewardId, result.chestType)
    }
  }, [phase, countdown, primarySkill])

  // ── Chest queue emptied → advance to inventory (user opened or dismissed) ─
  useEffect(() => {
    if (phase !== 'grind_running' || !chestGranted.current) return
    if (chestQueueLen > 0) return
    const id = setTimeout(() => {
      onNavigate('inventory')
      goTo('show_inventory')
    }, 1400)
    return () => clearTimeout(id)
  }, [phase, chestQueueLen])

  // ── Auto-advance: stop_session → celebrate ────────────────────────────────
  useEffect(() => {
    if (phase === 'stop_session' && sessionStatus === 'idle') {
      goTo('celebrate')
    }
  }, [phase, sessionStatus])

  // ── Safety: if user stops session early (during grind_running / show_*),
  //    jump straight to celebrate so the tour doesn't get stuck. ─────────────
  useEffect(() => {
    if (sessionStatus !== 'idle') return
    if (phase === 'grind_running' || phase === 'show_inventory' || phase === 'show_arena') {
      goTo('celebrate')
    }
  }, [phase, sessionStatus])

  function handleAction(nextPhase?: TourPhase) {
    if (phase === 'celebrate') {
      try {
        track('onboarding_tour_completed', { completed: true })
      } catch {}
      onDone()
      return
    }
    if (!nextPhase) return
    if (nextPhase === 'show_inventory') onNavigate('inventory')
    if (nextPhase === 'show_arena')     onNavigate('arena')
    if (nextPhase === 'stop_session')   onNavigate('home')
    goTo(nextPhase)
  }

  function skip() {
    try {
      track('onboarding_tour_completed', { completed: false, skipped_at: phase })
    } catch {}
    localStorage.setItem('grindly_tour_done', '1')
    onDone()
  }

  const content   = CONTENT[phase]
  const phaseIdx  = PHASES.indexOf(phase)
  // GRIND button is at screen center — card is at bottom → arrow should point UP
  const arrowUp   = phase === 'press_grind' || phase === 'stop_session'
  // Hide tour card while the chest-drop modal is up
  const hideCard  = phase === 'grind_running' && chestGranted.current && chestQueueLen > 0

  // ── Level-up detection for celebrate panel ────────────────────────────────
  const levelUps = useMemo(() => {
    return skillXPGains.filter(g => g.levelAfter > g.levelBefore)
  }, [skillXPGains])
  const durationLabel = lastSessionSummary?.durationFormatted ?? '—'

  return (
    <motion.div
      className="fixed inset-0 z-[300] pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Dim */}
      <div className="absolute inset-0 bg-black/35" />

      {/* ── Spotlight: GRIND button (idle) ── */}
      {phase === 'press_grind' && (
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
          style={{ top: 'calc(50% - 26px)' }}
          animate={{ scale: [1, 1.12, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div
            className="w-52 h-14 rounded-full border-2"
            style={{
              borderColor: 'rgba(74,222,128,0.7)',
              boxShadow: '0 0 28px rgba(74,222,128,0.35)',
            }}
          />
        </motion.div>
      )}

      {/* ── Spotlight: STOP button (running) ── */}
      {phase === 'stop_session' && (
        <motion.div
          className="absolute pointer-events-none"
          style={{ top: 'calc(50% - 22px)', left: 'calc(50% + 5px)' }}
          animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div
            className="w-28 h-11 rounded-full border-2"
            style={{
              borderColor: 'rgba(248,113,113,0.7)',
              boxShadow: '0 0 20px rgba(248,113,113,0.35)',
            }}
          />
        </motion.div>
      )}

      {/* ── Floating +XP drip above GRIND button ── */}
      {phase === 'grind_running' && (
        <div
          className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
          style={{ top: 'calc(50% - 80px)', width: 0, height: 0 }}
        >
          <AnimatePresence>
            {floaters.map(f => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, y: 12, x: f.xOffset, scale: 0.8 }}
                animate={{ opacity: [0, 1, 1, 0], y: -60, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2, ease: 'easeOut', times: [0, 0.12, 0.65, 1] }}
                className="absolute top-0 left-0 -translate-x-1/2 whitespace-nowrap text-xs font-bold tabular-nums"
                style={{ color: f.color, textShadow: `0 0 8px ${f.color}80` }}
              >
                +{f.xp} XP <span className="text-[10px] opacity-80">{f.label}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Tour card ── */}
      <div
        className="absolute bottom-[68px] left-0 right-0 flex justify-center px-3 pointer-events-auto"
      >
        <AnimatePresence mode="wait">
          {!hideCard && (
            <motion.div
              key={phase}
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: MOTION.duration.base, ease: MOTION.easingSoft }}
              className="w-full max-w-xs rounded-card border border-accent/25 bg-surface-2 shadow-modal overflow-hidden"
            >
              {/* Progress bar */}
              <div className="h-[2px] bg-white/[0.05]">
                <motion.div
                  className="h-full bg-accent"
                  animate={{ width: `${((phaseIdx + 1) / PHASES.length) * 100}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>

              <div className="px-4 py-3.5 space-y-2.5">
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white leading-snug">{content.title}</p>
                    {content.desc && (
                      <p className="text-xs text-gray-400 leading-relaxed mt-0.5">{content.desc}</p>
                    )}
                  </div>
                  <span className="text-micro font-mono text-gray-600 shrink-0 pt-0.5">
                    {phaseIdx + 1}/{PHASES.length}
                  </span>
                </div>

                {/* Countdown bar */}
                {phase === 'grind_running' && (
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-micro text-gray-500">Loot incoming</span>
                      <span className="text-micro text-gray-500 tabular-nums">{countdown}s</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-white/8 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-green-400"
                        animate={{ width: `${(countdown / CHEST_DELAY_SECS) * 100}%` }}
                        transition={{ duration: 0.9, ease: 'linear' }}
                      />
                    </div>
                  </div>
                )}

                {/* Celebrate mini-report */}
                {phase === 'celebrate' && (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-3 gap-1.5">
                      <div className="rounded bg-white/[0.04] px-2 py-1.5 border border-white/5">
                        <p className="text-micro text-gray-500">Focused</p>
                        <p className="text-xs font-bold text-white tabular-nums">{durationLabel}</p>
                      </div>
                      <div className="rounded bg-white/[0.04] px-2 py-1.5 border border-white/5">
                        <p className="text-micro text-gray-500">Skill XP</p>
                        <p
                          className="text-xs font-bold tabular-nums"
                          style={{ color: primarySkill.color }}
                        >
                          +{sessionSkillXPEarned}
                        </p>
                      </div>
                      <div className="rounded bg-white/[0.04] px-2 py-1.5 border border-white/5">
                        <p className="text-micro text-gray-500">Chest</p>
                        <p className="text-xs font-bold text-white">Opened</p>
                      </div>
                    </div>
                    {levelUps.length > 0 && (
                      <div
                        className="rounded px-2 py-1.5 border text-left"
                        style={{
                          borderColor: 'rgba(250,204,21,0.25)',
                          background: 'rgba(250,204,21,0.06)',
                        }}
                      >
                        <p className="text-micro font-mono text-yellow-400 uppercase tracking-wider">
                          Level up!
                        </p>
                        <p className="text-xs text-white">
                          {levelUps
                            .slice(0, 2)
                            .map(g => {
                              const s = SKILLS.find(x => x.id === g.skillId)
                              return `${s?.name ?? g.skillId} → L${g.levelAfter}`
                            })
                            .join(' · ')}
                        </p>
                      </div>
                    )}
                    <p className="text-caption text-gray-500">
                      Grind daily to level up, gear up and beat harder bosses.
                    </p>
                  </div>
                )}

                {/* Actions row */}
                <div className="flex items-center justify-between">
                  {content.showSkip ? (
                    <button
                      type="button"
                      onClick={skip}
                      className="text-micro text-gray-600 hover:text-gray-400 transition-colors"
                    >
                      Skip tour
                    </button>
                  ) : <span />}

                  {content.action && (
                    <motion.button
                      type="button"
                      onClick={() => handleAction(content.nextPhase)}
                      whileTap={{ scale: 0.96 }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent text-white text-xs font-bold"
                    >
                      {content.action}
                    </motion.button>
                  )}
                </div>
              </div>

              {/* Up arrow pointing at GRIND / STOP button above */}
              {arrowUp && (
                <div className="absolute -top-[5px] left-1/2 -translate-x-1/2">
                  <div className="w-2 h-2 border-l border-t border-accent/40 rotate-45 bg-surface-2" />
                </div>
              )}
              {/* Down arrow — other phases where target is below card */}
              {!arrowUp && (
                <div className="flex justify-center pb-2">
                  <div className="w-2 h-2 border-r border-b border-accent/40 rotate-45 translate-y-0.5" />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ── Legacy exports for App.tsx compatibility ──────────────────────────────────

/** Returns null — interactive tour manages its own highlighting */
export function getTourHighlightTab(_active: boolean, _step: number): TabId | null {
  return null
}

export { PHASES as TOUR_STEPS }
