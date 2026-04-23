import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore } from '../../stores/sessionStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { playClickSound } from '../../lib/sounds'
import { MOTION } from '../../lib/motion'

const FOCUS_DURATIONS = [
  { label: '25m', ms: 25 * 60 * 1000 },
  { label: '45m', ms: 45 * 60 * 1000 },
  { label: '1h', ms: 60 * 60 * 1000 },
  { label: '2h', ms: 2 * 60 * 60 * 1000 },
  { label: '3h', ms: 3 * 60 * 60 * 1000 },
]

function formatShort(seconds: number): string {
  const safe = Math.max(0, seconds)
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

interface QuickActionsArrowProps {
  onOpenGoal: () => void
  onOpenTask: () => void
}

export function QuickActionsArrow({ onOpenGoal, onOpenTask }: QuickActionsArrowProps) {
  const {
    focusModeActive,
    focusModeEndsAt,
    elapsedSeconds,
    status,
    start,
    enableFocusMode,
    disableFocusMode,
  } = useSessionStore()
  const pushNotification = useNotificationStore((s) => s.push)

  const [open, setOpen] = useState(false)
  const [showFocusPicker, setShowFocusPicker] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const remainingSeconds = useMemo(() => {
    if (!focusModeActive || !focusModeEndsAt) return 0
    return Math.max(0, Math.ceil((focusModeEndsAt - Date.now()) / 1000))
  }, [focusModeActive, focusModeEndsAt, status, elapsedSeconds])

  const isLow = focusModeActive && remainingSeconds > 0 && remainingSeconds < 300

  useEffect(() => {
    if (!open) setShowFocusPicker(false)
  }, [open])

  const handleFocusPick = async (durationMs: number) => {
    playClickSound()
    try {
      if (status === 'idle') {
        await start({ focusDurationMs: durationMs })
      } else {
        await enableFocusMode(durationMs)
      }
      setOpen(false)
    } catch (err) {
      pushNotification({
        type: 'progression',
        icon: '⚠️',
        title: 'Focus mode',
        body: err instanceof Error ? err.message : 'Failed to start focus mode',
      })
    }
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const [popoverPos, setPopoverPos] = useState({ right: 0, bottom: 0 })
  useLayoutEffect(() => {
    if (!open || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setPopoverPos({
      right: window.innerWidth - rect.right,
      bottom: window.innerHeight - rect.top + 6,
    })
  }, [open, showFocusPicker])

  const popoverContent = open && (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 6, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 4, scale: 0.97 }}
        transition={{ duration: MOTION.duration.base, ease: MOTION.easingSoft }}
        onMouseDown={(e) => e.stopPropagation()}
        className="fixed z-50 rounded-card border border-white/10 bg-surface-2/95 backdrop-blur-sm shadow-xl overflow-hidden"
        style={{ right: popoverPos.right, bottom: popoverPos.bottom, minWidth: 148 }}
      >
        {/* Goal */}
        <button
          onClick={() => { playClickSound(); setOpen(false); onOpenGoal() }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.05] transition-colors border-b border-white/[0.06]"
        >
          <span className="text-sm leading-none">⏱</span>
          <span className="text-xs text-gray-300">Time goal</span>
        </button>

        {/* Task */}
        <button
          onClick={() => { playClickSound(); setOpen(false); onOpenTask() }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.05] transition-colors border-b border-white/[0.06]"
        >
          <span className="text-sm leading-none">✅</span>
          <span className="text-xs text-gray-300">Task</span>
        </button>

        {/* Focus */}
        {focusModeActive ? (
          <div className="flex items-center gap-2 px-3 py-2.5">
            <span className="text-sm leading-none">🎯</span>
            <span className={`text-xs font-mono flex-1 ${isLow ? 'text-amber-400 animate-pulse' : 'text-accent'}`}>
              {formatShort(remainingSeconds)}
            </span>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => { playClickSound(); disableFocusMode().catch(() => {}); setOpen(false) }}
              className="text-gray-500 hover:text-red-400 transition-colors text-sm leading-none px-1 rounded hover:bg-red-500/10"
            >
              ×
            </button>
          </div>
        ) : showFocusPicker ? (
          <div className="px-2 py-2 space-y-1">
            <div className="flex items-center gap-1.5 px-1 pb-1 border-b border-white/[0.06]">
              <button
                onClick={() => setShowFocusPicker(false)}
                className="text-gray-600 hover:text-gray-400 transition-colors text-micro"
              >
                ‹
              </button>
              <span className="text-micro font-mono text-gray-600">Focus duration</span>
            </div>
            {FOCUS_DURATIONS.map(({ label, ms }) => (
              <button
                key={label}
                onClick={() => { handleFocusPick(ms).catch(() => {}) }}
                className="w-full text-xs font-mono py-1.5 px-2.5 rounded border border-white/10 text-gray-300 hover:text-accent hover:border-accent/40 hover:bg-accent/[0.08] transition-colors text-left"
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <button
            onClick={() => { playClickSound(); setShowFocusPicker(true) }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.05] transition-colors"
          >
            <span className="text-sm leading-none">🎯</span>
            <span className="text-xs text-gray-500 group-hover:text-gray-300 transition-colors">Focus</span>
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  )

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        onClick={() => { playClickSound(); setOpen((v) => !v) }}
        title="Goal · Task · Focus"
        className={`h-full px-2.5 rounded border transition-all duration-150 flex items-center justify-center ${
          focusModeActive
            ? isLow
              ? 'border-amber-500/50 text-amber-400 bg-amber-500/10 animate-pulse'
              : 'border-accent/40 text-accent bg-accent/[0.08] hover:bg-accent/12'
            : open
              ? 'border-white/20 text-gray-300 bg-white/[0.04]'
              : 'border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20 hover:bg-white/[0.03]'
        }`}
      >
        <motion.svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          animate={{ rotate: open ? -90 : 0 }}
          transition={{ duration: 0.18 }}
        >
          <path d="M3 2L7 5L3 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
      </button>
      {typeof document !== 'undefined' && createPortal(popoverContent, document.body)}
    </div>
  )
}
