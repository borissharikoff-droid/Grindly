import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useArenaToastStore, type ArenaToast } from '../../stores/arenaToastStore'
import { playClickSound } from '../../lib/sounds'

const TOAST_TTL_MS = 5000

function ToastItem({
  toast,
  onDismiss,
  onClaim,
}: {
  toast: ArenaToast
  onDismiss: () => void
  onClaim: () => void
}) {
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - toast.createdAt
      setProgress(Math.max(0, 100 - (elapsed / TOAST_TTL_MS) * 100))
    }
    tick()
    const interval = setInterval(tick, 80)
    return () => clearInterval(interval)
  }, [toast.createdAt])

  return (
    <div className="rounded-xl bg-discord-card border border-white/10 shadow-lg overflow-hidden">
      <div className="px-3 py-2.5 flex items-center gap-2">
        <span className="text-base shrink-0">{toast.victory ? '🏆' : '💀'}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-white font-medium leading-tight">
            {toast.victory ? `Killed ${toast.bossName}!` : `Fell vs ${toast.bossName}`}
          </p>
          {toast.victory && toast.gold > 0 && (
            <p className="text-[10px] text-amber-400 mt-0.5">🪙 +{toast.gold} gold</p>
          )}
        </div>
        {toast.victory && (
          <button
            type="button"
            onClick={() => { playClickSound(); onClaim() }}
            className="shrink-0 text-cyber-neon hover:text-cyber-neon/70 text-[10px] font-semibold px-1.5 py-0.5 border border-cyber-neon/30 rounded-md transition-colors"
          >
            Claim
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-gray-500 hover:text-gray-300 text-[10px] p-0.5 transition-colors"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
      {/* TTL progress bar */}
      <div className="h-0.5 bg-discord-darker/60">
        <div
          className={`h-full transition-[width] duration-75 ${toast.victory ? 'bg-cyber-neon/50' : 'bg-red-500/40'}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

export function ArenaToasts() {
  const { toasts, dismiss, claimAndDismiss } = useArenaToastStore()

  return (
    <div className="fixed top-3 right-3 z-40 flex flex-col gap-2 pointer-events-none max-w-[240px]">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 24, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24, scale: 0.96 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className="pointer-events-auto"
          >
            <ToastItem
              toast={t}
              onDismiss={() => dismiss(t.id)}
              onClaim={() => claimAndDismiss(t.id)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
