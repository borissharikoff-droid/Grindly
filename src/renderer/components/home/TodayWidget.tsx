import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { getSkillById } from '../../lib/skills'

interface TodayRecap {
  totalSeconds: number
  sessionCount: number
  topSkill: { skill_id: string; xp: number } | null
  totalXP: number
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0m'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatXP(xp: number): string {
  if (xp >= 1000) return `${(xp / 1000).toFixed(1)}k`
  return Math.round(xp).toLocaleString()
}

interface Props {
  onOpenStats?: () => void
}

export function TodayWidget({ onOpenStats }: Props) {
  const [recap, setRecap] = useState<TodayRecap | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const api = window.electronAPI?.db
      if (!api?.getTodayRecap) { setLoading(false); return }
      const data = await api.getTodayRecap()
      setRecap(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // Refresh every 60s while mounted so it updates as sessions complete.
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  if (loading || !recap) return null

  const topSkillDef = recap.topSkill ? getSkillById(recap.topSkill.skill_id) : null
  const hasActivity = recap.sessionCount > 0 || recap.totalSeconds > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onClick={onOpenStats}
      className={`rounded-xl border border-discord-border bg-discord-darker/60 px-4 py-3 ${onOpenStats ? 'cursor-pointer hover:bg-discord-darker hover:border-discord-primary/40 transition-colors' : ''}`}
      role={onOpenStats ? 'button' : undefined}
      tabIndex={onOpenStats ? 0 : undefined}
      onKeyDown={(e) => {
        if (onOpenStats && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onOpenStats()
        }
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-wider text-discord-muted font-semibold">
          Today
        </div>
        {onOpenStats && (
          <div className="text-[10px] text-discord-muted">Stats →</div>
        )}
      </div>

      {!hasActivity ? (
        <div className="text-sm text-discord-muted">
          No sessions yet today. Start a grind to light it up.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-lg font-bold text-discord-text leading-none">
              {formatDuration(recap.totalSeconds)}
            </div>
            <div className="text-[10px] text-discord-muted mt-1 uppercase tracking-wider">
              Time
            </div>
          </div>

          <div>
            <div className="text-lg font-bold text-discord-text leading-none">
              {recap.sessionCount}
            </div>
            <div className="text-[10px] text-discord-muted mt-1 uppercase tracking-wider">
              Session{recap.sessionCount === 1 ? '' : 's'}
            </div>
          </div>

          <div>
            {topSkillDef && recap.topSkill ? (
              <>
                <div className="flex items-center gap-1 leading-none">
                  <span className="text-base">{topSkillDef.icon}</span>
                  <span
                    className="text-sm font-bold"
                    style={{ color: topSkillDef.color }}
                  >
                    +{formatXP(recap.topSkill.xp)}
                  </span>
                </div>
                <div className="text-[10px] text-discord-muted mt-1 uppercase tracking-wider truncate">
                  {topSkillDef.name}
                </div>
              </>
            ) : (
              <>
                <div className="text-lg font-bold text-discord-text leading-none">
                  {formatXP(recap.totalXP)}
                </div>
                <div className="text-[10px] text-discord-muted mt-1 uppercase tracking-wider">
                  XP
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}
