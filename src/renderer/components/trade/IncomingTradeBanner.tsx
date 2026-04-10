import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTradeStore } from '../../stores/tradeStore'

function useCountdownShort(expiresAt: string | null) {
  const [secs, setSecs] = useState(() =>
    expiresAt ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)) : 0
  )
  useEffect(() => {
    if (!expiresAt) return
    const t = setInterval(() => {
      setSecs(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)))
    }, 1000)
    return () => clearInterval(t)
  }, [expiresAt])
  if (secs <= 0) return null
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export function IncomingTradeBanner() {
  const incomingOffer = useTradeStore((s) => s.incomingOffer)
  const openReview = useTradeStore((s) => s.openReview)
  const setIncomingOffer = useTradeStore((s) => s.setIncomingOffer)
  const countdown = useCountdownShort(incomingOffer?.expires_at ?? null)

  // Auto-clear banner when offer expires
  useEffect(() => {
    if (countdown === null && incomingOffer) {
      setIncomingOffer(null)
    }
  }, [countdown, incomingOffer, setIncomingOffer])

  return (
    <AnimatePresence>
      {incomingOffer && countdown !== null && (
        <motion.div
          key="trade-banner"
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -40 }}
          transition={{ duration: 0.2 }}
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 px-4 py-2.5 rounded-full bg-surface-0 border border-emerald-500/30 shadow-2xl"
        >
          <span className="text-sm">⇄</span>
          <p className="text-xs text-white font-medium">
            {incomingOffer.initiator_username || 'Someone'} wants to trade
          </p>
          <span className="text-[10px] font-mono text-amber-400">{countdown}</span>
          {/* No dismiss — must Review to Accept or Decline */}
          <button
            type="button"
            onClick={() => openReview(incomingOffer)}
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors px-1.5 py-0.5 rounded border border-emerald-500/30 hover:border-emerald-400/50"
          >
            Review
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
