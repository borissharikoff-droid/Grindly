import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore } from '../../stores/sessionStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { playClickSound } from '../../lib/sounds'
import { MOTION } from '../../lib/motion'

function formatShort(seconds: number): string {
  const safe = Math.max(0, seconds)
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function FocusModeDock() {
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
  const containerRef = useRef<HTMLDivElement>(null)
  const hasElectron = typeof window !== 'undefined' && !!window.electronAPI

  const remainingSeconds = useMemo(() => {
    if (!focusModeActive || !focusModeEndsAt) return 0
    return Math.max(0, Math.ceil((focusModeEndsAt - Date.now()) / 1000))
  }, [focusModeActive, focusModeEndsAt, status, elapsedSeconds])

  const handlePick = async (hours: number) => {
    playClickSound()
    const durationMs = Math.max(1, hours) * 60 * 60 * 1000
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const [dropdownPos, setDropdownPos] = useState({ left: 0, top: 0 })
  useLayoutEffect(() => {
    if (!open || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setDropdownPos({
      left: rect.left + rect.width / 2,
      top: rect.bottom + 8,
    })
  }, [open])

  const dropdownContent = open && (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 6, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 4, scale: 0.98 }}
        transition={{ duration: MOTION.duration.base, ease: MOTION.easingSoft }}
        className="fixed z-50 inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-discord-card/95 backdrop-blur-sm px-2 py-1.5 shadow-xl"
        style={{
          left: dropdownPos.left,
          top: dropdownPos.top,
          transform: 'translateX(-50%)',
        }}
      >
        {[1, 2, 3].map((hours) => (
          <button
            key={hours}
            onClick={() => { handlePick(hours).catch(() => {}) }}
            className="text-[11px] font-mono py-1.5 px-2.5 rounded-lg border border-white/10 text-gray-300 hover:text-cyber-neon hover:border-cyber-neon/40 hover:bg-cyber-neon/8 transition-colors duration-200"
          >
            {hours}h
          </button>
        ))}

        {focusModeActive && (
          <button
            onClick={() => {
              playClickSound()
              disableFocusMode().catch(() => {})
              setOpen(false)
            }}
            className="text-[11px] font-mono py-1.5 px-2.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors duration-200"
          >
            off
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  )

  return (
    <div ref={containerRef} className="relative inline-flex items-center overflow-visible">
      <div className="flex items-center gap-1.5">
        {focusModeActive && (
          <button
            onClick={() => {
              playClickSound()
              disableFocusMode().catch(() => {})
            }}
            title="Cancel focus mode"
            className="text-[11px] font-mono py-1.5 px-2 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/20 hover:bg-white/5 transition-colors duration-200"
          >
            off
          </button>
        )}
        <button
          onClick={() => {
            playClickSound()
            setOpen((v) => !v)
          }}
          title={
            focusModeActive
              ? 'Focus mode is active'
              : !hasElectron
                ? 'Focus mode requires the desktop app (Electron)'
                : 'Enable Focus mode — blocks Windows notifications'
          }
          className={`text-xs py-2 px-3 rounded-lg border transition-all duration-150 ${
            focusModeActive
              ? 'border-cyber-neon/45 text-cyber-neon bg-cyber-neon/8'
              : 'border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20 hover:bg-white/[0.03]'
          }`}
        >
          {focusModeActive ? `⏱ ${formatShort(remainingSeconds)}` : '+ focus'}
        </button>
      </div>

      {typeof document !== 'undefined' && createPortal(dropdownContent, document.body)}
    </div>
  )
}
