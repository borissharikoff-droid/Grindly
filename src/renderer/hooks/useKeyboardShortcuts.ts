import { useEffect } from 'react'
import { useSessionStore } from '../stores/sessionStore'

interface KeyboardShortcutOptions {
  onEscapeToHome?: () => void
}

export function useKeyboardShortcuts(options: KeyboardShortcutOptions = {}) {
  const { status, start, stop, pause, resume } = useSessionStore()
  const { onEscapeToHome } = options

  useEffect(() => {
    const enabled = localStorage.getItem('grindly_shortcuts_enabled') !== 'false'
    if (!enabled) return

    const handler = (e: KeyboardEvent) => {
      // Don't trigger in input fields
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return

      if (e.key === 'Escape') {
        onEscapeToHome?.()
        return
      }

      // Ctrl+S — Start / Stop session
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (status === 'idle') {
          start()
        } else {
          stop()
        }
      }

      // Ctrl+P — Pause / Resume
      if (e.ctrlKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        if (status === 'running') {
          pause()
        } else if (status === 'paused') {
          resume()
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [status, start, stop, pause, resume, onEscapeToHome])
}
