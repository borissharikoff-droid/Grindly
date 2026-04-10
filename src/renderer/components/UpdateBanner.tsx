import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotificationStore } from '../stores/notificationStore'

const AUTO_RESTART_SECONDS = 30

/** Exported for testing — determines which UI mode to show when an update is ready. */
export function getUpdateReadyMode(platform: string): 'countdown' | 'download-link' {
  return platform === 'darwin' ? 'download-link' : 'countdown'
}

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'downloading'; version: string; platform: string }
  | { phase: 'ready'; version: string; platform: string }

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateState>({ phase: 'idle' })
  const [countdown, setCountdown] = useState(AUTO_RESTART_SECONDS)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.updater?.onStatus) return
    const unsub = api.updater.onStatus((info) => {
      const platform = (info as { platform?: string }).platform ?? 'win32'
      if (info.status === 'downloading') {
        setUpdate({ phase: 'downloading', version: info.version || '', platform })
      } else if (info.status === 'ready') {
        setUpdate({ phase: 'ready', version: info.version || '', platform })
        if (platform !== 'darwin') setCountdown(AUTO_RESTART_SECONDS)
        useNotificationStore.getState().push({
          type: 'update',
          icon: '⬇️',
          title: 'Update ready',
          body: platform === 'darwin'
            ? `Version ${info.version || ''} available — download from GitHub`
            : info.version ? `Version ${info.version} — restarting in ${AUTO_RESTART_SECONDS}s` : 'A new version is ready',
        })
      }
    })
    return unsub
  }, [])

  // Countdown tick when update is ready — Windows only
  useEffect(() => {
    if (update.phase !== 'ready') return
    if (getUpdateReadyMode(update.platform) !== 'countdown') return

    intervalRef.current = setInterval(() => {
      setCountdown((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current!)
          window.electronAPI?.updater?.install?.()
          return 0
        }
        return s - 1
      })
    }, 1_000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [update.phase])

  const visible = update.phase !== 'idle'

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div className="flex items-center gap-2 px-4 py-2 bg-accent/15 border-b border-accent/30">
            {update.phase === 'downloading' ? (
              <>
                <span className="text-sm animate-spin">⟳</span>
                <p className="flex-1 text-xs text-white/80">
                  Downloading update
                  {update.version && (
                    <> <span className="font-mono text-accent font-bold">{update.version}</span></>
                  )}…
                </p>
              </>
            ) : getUpdateReadyMode(update.platform) === 'download-link' ? (
              <>
                <span className="text-sm">⬇️</span>
                <p className="flex-1 text-xs text-white/80">
                  Update{' '}
                  {update.version && (
                    <span className="font-mono text-accent font-bold">{update.version}</span>
                  )}{' '}
                  available
                </p>
                <button
                  onClick={() => window.electronAPI?.updater?.install?.()}
                  className="shrink-0 px-2.5 py-1 rounded bg-accent text-white text-caption font-semibold hover:bg-accent-hover transition-colors"
                >
                  Download →
                </button>
              </>
            ) : (
              <>
                <span className="text-sm">⬇️</span>
                <p className="flex-1 text-xs text-white/80">
                  Update{' '}
                  {update.version && (
                    <span className="font-mono text-accent font-bold">{update.version}</span>
                  )}{' '}
                  ready — restarting in{' '}
                  <span className="font-mono text-accent font-bold">{countdown}s</span>
                </p>
                <button
                  onClick={() => window.electronAPI?.updater?.install?.()}
                  className="shrink-0 px-2.5 py-1 rounded bg-accent text-white text-caption font-semibold hover:bg-accent-hover transition-colors"
                >
                  Restart Now
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
