import { useEffect } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { categoryToSkillId } from '../lib/skills'
import { SKILL_COLORS } from '../lib/skillColors'

function hexToSpaceSep(hex: string): string {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ].join(' ')
}

const DEFAULT_GLOW = '88 101 242'
const DEFAULT_HEX = '#5865F2'

export function useSkillAmbient() {
  const status = useSessionStore((s) => s.status)
  const category = useSessionStore((s) => s.currentActivity?.category)

  useEffect(() => {
    const root = document.documentElement
    if (status !== 'running' || !category) {
      root.style.setProperty('--skill-glow', DEFAULT_GLOW)
      root.style.setProperty('--skill-hex', DEFAULT_HEX)
      return
    }
    const skillId = categoryToSkillId(category)
    const hex = SKILL_COLORS[skillId]
    if (hex) {
      root.style.setProperty('--skill-glow', hexToSpaceSep(hex))
      root.style.setProperty('--skill-hex', hex)
    } else {
      root.style.setProperty('--skill-glow', DEFAULT_GLOW)
      root.style.setProperty('--skill-hex', DEFAULT_HEX)
    }
  }, [status, category])
}
