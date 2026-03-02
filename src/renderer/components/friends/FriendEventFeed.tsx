import { useEffect, useMemo, useState } from 'react'
import { fetchFriendFeed, type SocialFeedEvent } from '../../services/socialFeed'
import { trackMetric } from '../../services/rolloutMetrics'

function formatAgo(ts: string): string {
  const ms = Date.now() - Date.parse(ts)
  const min = Math.max(0, Math.floor(ms / 60000))
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function renderBody(event: SocialFeedEvent): string {
  const p = event.payload || {}
  switch (event.event_type) {
    case 'skill_level_up':
      return `${String(p.skillId || 'skill')} -> LVL ${String(p.level || '?')}`
    case 'achievement_unlocked':
      return `Unlocked ${String(p.achievementName || p.achievementId || 'achievement')}`
    case 'streak_milestone':
      return `Streak ${String(p.streak || '?')} days`
    case 'competition_result':
      return `${String(p.period || '')} ${String(p.skillId || '')}: #${String(p.rank || '?')}`
    case 'session_milestone':
      return String(p.label || 'Session milestone')
    default:
      return 'Progress event'
  }
}

export function FriendEventFeed() {
  const [events, setEvents] = useState<SocialFeedEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    trackMetric('friends_feed_viewed')
    let cancelled = false
    ;(async () => {
      const rows = await fetchFriendFeed(30)
      if (!cancelled) {
        setEvents(rows)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const visible = useMemo(() => events.slice(0, 12), [events])

  return (
    <div className="rounded-xl bg-discord-card/80 border border-white/10 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Friends feed</p>
        <span className="text-[10px] text-gray-600 font-mono">{events.length}</span>
      </div>
      {loading ? (
        <p className="text-xs text-gray-500">Loading events...</p>
      ) : visible.length === 0 ? (
        <p className="text-xs text-gray-500">No social events yet.</p>
      ) : (
        <div className="space-y-1.5">
          {visible.map((event) => (
            <div key={event.id} className="rounded-lg border border-white/10 bg-discord-darker/50 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-white truncate">
                  {(event.username || 'Friend')}
                </p>
                <span className="text-[10px] text-gray-500 font-mono">{formatAgo(event.created_at)}</span>
              </div>
              <p className="text-[10px] text-gray-400">{renderBody(event)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
