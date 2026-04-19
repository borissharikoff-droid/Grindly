import { useState } from 'react'
import { TodayShareModal } from '../home/TodayShareModal'
import { useAuthStore } from '../../stores/authStore'
import { computeTotalSkillLevel } from '../../lib/skills'
import { supabase } from '../../lib/supabase'
import { playClickSound } from '../../lib/sounds'
import type { TodayCardInput } from '../../lib/shareCard'
import { useToastStore } from '../../stores/toastStore'

interface Props {
  sinceMs: number
  periodLabel: string
  heroCaption: string
}

/** Loads a period-scoped recap and opens the share modal. Used from Stats page. */
export function ShareStatsButton({ sinceMs, periodLabel, heroCaption }: Props) {
  const user = useAuthStore((s) => s.user)
  const pushToast = useToastStore((s) => s.push)
  const [input, setInput] = useState<TodayCardInput | null>(null)
  const [loading, setLoading] = useState(false)

  const handleOpen = async () => {
    if (loading) return
    playClickSound()
    setLoading(true)
    try {
      const api = window.electronAPI?.db
      if (!api?.getPeriodRecap) {
        pushToast({ kind: 'generic', type: 'error', message: 'Share is unavailable in this build' })
        return
      }
      const recap = await api.getPeriodRecap(sinceMs || undefined)
      if (!recap || recap.totalSeconds <= 0) {
        pushToast({ kind: 'generic', type: 'error', message: 'Nothing to share yet for this period' })
        return
      }

      // Identity (avatar, level, streak) — best-effort
      let avatar: string | null = null
      let level = 0
      let streak = 0
      if (user) {
        try {
          const cached = JSON.parse(localStorage.getItem(`grindly_profile_cache_${user.id}`) || '{}') as { avatar?: string }
          if (cached.avatar) avatar = cached.avatar
        } catch { /* ignore */ }
        if (supabase) {
          const { data } = await supabase.from('profiles').select('avatar_url').eq('id', user.id).single()
          if (data?.avatar_url) avatar = (data.avatar_url as string) || avatar
        }
        try {
          streak = (await api.getStreak()) || 0
        } catch { /* ignore */ }
        try {
          const rows = await api.getAllSkillXP()
          level = computeTotalSkillLevel(rows || [])
        } catch { /* ignore */ }
      }

      const username = (user?.user_metadata as { username?: string } | undefined)?.username || null
      setInput({
        totalSeconds: recap.totalSeconds,
        sessionCount: recap.sessionCount,
        topSkill: recap.topSkill,
        totalXP: recap.totalXP,
        username,
        avatar,
        level,
        streak,
        skills: recap.skills,
        keystrokes: recap.keystrokes,
        focusedSeconds: recap.focusedSeconds,
        distractedSeconds: recap.distractedSeconds,
        longestSessionSeconds: recap.longestSessionSeconds,
        topApp: recap.topApp,
        topApps: recap.topApps,
        periodLabel,
        heroCaption,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={loading}
        className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-accent hover:text-white bg-accent/15 hover:bg-accent/30 border border-accent/40 hover:border-accent/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors px-2.5 py-1.5 rounded-md"
        title={`Share ${periodLabel.toLowerCase()} summary`}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
        {loading ? 'Loading…' : 'Share'}
      </button>

      {input && (
        <TodayShareModal input={input} onClose={() => setInput(null)} />
      )}
    </>
  )
}
