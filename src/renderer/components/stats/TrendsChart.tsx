import { memo, useState, useEffect, useMemo } from 'react'

interface DailyTotal {
  date: string
  total_seconds: number
  total_keystrokes: number
  sessions_count: number
}

interface BarHover {
  x: number
  y: number
  date: string
  seconds: number
  sessions: number
  keystrokes: number
  diffVsAvg: number
}

interface HeatHover {
  x: number
  y: number
  date: string
  seconds: number
  rank: number
  total: number
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}

type TrendRange = '7d' | '30d' | '90d' | 'custom'

interface TrendsChartProps {
  days?: number
  periodLabel?: string
  showRangeControls?: boolean
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short' })
}

function getShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const TrendsChart = memo(function TrendsChart({
  days: externalDays,
  periodLabel,
  showRangeControls = true,
}: TrendsChartProps) {
  const [range, setRange] = useState<TrendRange>('7d')
  const [customDays, setCustomDays] = useState(45)
  const [data, setData] = useState<DailyTotal[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [barHover, setBarHover] = useState<BarHover | null>(null)
  const [heatHover, setHeatHover] = useState<HeatHover | null>(null)

  useEffect(() => {
    loadData()
  }, [range, customDays, externalDays])

  async function loadData() {
    const useFullLoader = data.length === 0
    if (useFullLoader) setLoading(true)
    else setRefreshing(true)
    const api = window.electronAPI
    if (!api?.db?.getDailyTotals) {
      setLoading(false)
      setRefreshing(false)
      return
    }
    const days = externalDays ?? (range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : Math.max(1, customDays))
    const totals = await api.db.getDailyTotals(days) as DailyTotal[]
    setData(totals || [])
    setLoading(false)
    setRefreshing(false)
  }

  // Fill in missing days
  const days = externalDays ?? (range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : Math.max(1, customDays))
  const filledData = useMemo(() => {
    const result: DailyTotal[] = []
    const dataMap = new Map(data.map(d => [d.date, d]))
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      result.push(dataMap.get(dateStr) || { date: dateStr, total_seconds: 0, total_keystrokes: 0, sessions_count: 0 })
    }
    return result
  }, [data, days])

  const maxSeconds = Math.max(...filledData.map(d => d.total_seconds), 1)
  const totalPeriodSeconds = filledData.reduce((s, d) => s + d.total_seconds, 0)
  const totalPeriodSessions = filledData.reduce((s, d) => s + d.sessions_count, 0)
  const avgDailySeconds = Math.round(totalPeriodSeconds / days)

  // For heatmap we always fetch 90 days worth
  const [heatmapFullData, setHeatmapFullData] = useState<DailyTotal[]>([])
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.db?.getDailyTotals) return
    api.db.getDailyTotals(90).then((totals) => {
      setHeatmapFullData((totals as DailyTotal[]) || [])
    })
  }, [])

  const heatmap90 = useMemo(() => {
    const result: { date: string; seconds: number }[] = []
    const dataMap = new Map(heatmapFullData.map(d => [d.date, d.total_seconds]))
    for (let i = 89; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      result.push({ date: dateStr, seconds: dataMap.get(dateStr) || 0 })
    }
    return result
  }, [heatmapFullData])

  const heatmapMax = Math.max(...heatmap90.map(d => d.seconds), 1)
  const heatmapRanks = useMemo(() => {
    const active = heatmap90.filter(d => d.seconds > 0).sort((a, b) => b.seconds - a.seconds)
    const map = new Map<string, number>()
    active.forEach((d, i) => map.set(d.date, i + 1))
    return { map, total: active.length }
  }, [heatmap90])

  function getHeatColor(seconds: number): string {
    if (seconds === 0) return 'rgba(255,255,255,0.03)'
    const intensity = Math.min(1, seconds / heatmapMax)
    if (intensity < 0.25) return 'rgba(0,255,136,0.15)'
    if (intensity < 0.5) return 'rgba(0,255,136,0.3)'
    if (intensity < 0.75) return 'rgba(0,255,136,0.5)'
    return 'rgba(0,255,136,0.75)'
  }

  // Arrange heatmap into weeks (columns) of 7 days
  const weeks: { date: string; seconds: number }[][] = []
  for (let i = 0; i < heatmap90.length; i += 7) {
    weeks.push(heatmap90.slice(i, i + 7))
  }

  if (loading) {
    return (
      <div className="rounded-card bg-surface-2/80 border border-white/10 p-3">
        <p className="text-micro text-gray-500 font-mono animate-pulse">Loading trends...</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Bar chart */}
      <div className="rounded-card bg-surface-2/80 border border-white/10 p-3">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <p className="text-micro uppercase tracking-wider text-gray-500 font-mono">Daily Tracked Time</p>
            {refreshing && <span className="text-micro font-mono text-accent/80">Updating...</span>}
          </div>
          {showRangeControls ? (
            <div className="flex gap-1 flex-wrap justify-end">
              {(['7d', '30d', '90d', 'custom'] as TrendRange[]).map(r => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`text-micro px-2 py-0.5 rounded-md font-mono transition-colors ${
                    range === r ? 'bg-accent/15 text-accent border border-accent/30' : 'text-gray-600 hover:text-gray-400'
                  }`}
                >
                  {r === 'custom' ? 'Custom' : r}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-micro font-mono text-gray-500">{periodLabel || `${days} days`}</span>
          )}
        </div>
        {showRangeControls && range === 'custom' && (
          <div className="mb-2.5 rounded bg-surface-0/70 border border-white/10 p-2 flex items-center gap-2">
            <span className="text-micro uppercase tracking-wide text-gray-500 font-mono">Days</span>
            <input
              type="number"
              min={1}
              max={3650}
              value={customDays}
              onChange={(e) => {
                const next = Number(e.target.value)
                if (Number.isFinite(next)) setCustomDays(Math.max(1, Math.min(3650, Math.round(next))))
              }}
              className="w-24 rounded-md border border-white/10 bg-surface-0 px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-accent/40"
            />
            <span className="text-xs text-gray-400">days back from today</span>
          </div>
        )}

        {/* Summary stats */}
        <div className="flex gap-3 mb-3">
          <div>
            <p className="text-micro text-gray-600 font-mono">Total</p>
            <p className="text-xs font-mono font-bold text-accent">{formatDuration(totalPeriodSeconds)}</p>
          </div>
          <div>
            <p className="text-micro text-gray-600 font-mono">Avg/day</p>
            <p className="text-xs font-mono font-bold text-white">{formatDuration(avgDailySeconds)}</p>
          </div>
          <div>
            <p className="text-micro text-gray-600 font-mono">Sessions</p>
            <p className="text-xs font-mono font-bold text-white">{totalPeriodSessions}</p>
          </div>
        </div>

        {/* Bar chart */}
        <div className="relative overflow-hidden" onMouseLeave={() => setBarHover(null)}>
          <div className="flex items-end gap-0.5 h-20">
          {filledData.map((d, i) => {
            const pct = (d.total_seconds / maxSeconds) * 100
            const isActive = barHover?.date === d.date
            return (
              <div
                key={d.date}
                className="flex-1 h-full flex items-end group relative cursor-pointer"
                onMouseEnter={(e) => {
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                  setBarHover({
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                    date: d.date,
                    seconds: d.total_seconds,
                    sessions: d.sessions_count,
                    keystrokes: d.total_keystrokes,
                    diffVsAvg: d.total_seconds - avgDailySeconds,
                  })
                }}
              >
                <div
                  style={{
                    height: `${Math.max(pct, d.total_seconds > 0 ? 4 : 1)}%`,
                    transition: 'height 220ms cubic-bezier(0.22, 1, 0.36, 1), background-color 150ms ease',
                    transitionDelay: `${Math.min(i * 8, 120)}ms`,
                  }}
                  className={`w-full rounded-t-sm ${
                    d.total_seconds > 0
                      ? isActive
                        ? 'bg-accent'
                        : 'bg-accent/60 group-hover:bg-accent/80'
                      : isActive
                        ? 'bg-white/10'
                        : 'bg-white/[0.03]'
                  }`}
                />
              </div>
            )
          })}
          </div>
          {barHover && (
            <div
              className="fixed z-50 pointer-events-none rounded px-2 py-1.5 text-xs font-mono leading-tight"
              style={{
                left: Math.min(Math.max(barHover.x - 80, 8), (typeof window !== 'undefined' ? window.innerWidth : 800) - 168),
                top: barHover.y - 78,
                background: 'rgba(15,14,26,0.97)',
                border: '1px solid rgba(0,255,136,0.3)',
                color: '#eae6f5',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                whiteSpace: 'nowrap',
                width: 160,
              }}
            >
              <div className="text-gray-500" style={{ fontSize: 10 }}>{formatFullDate(barHover.date)}</div>
              <div className="flex items-baseline justify-between">
                <span className="text-accent font-bold">{formatDuration(barHover.seconds)}</span>
                <span className="text-gray-600" style={{ fontSize: 10 }}>{barHover.sessions} sess</span>
              </div>
              <div className="flex items-baseline justify-between mt-0.5">
                <span className="text-gray-500" style={{ fontSize: 10 }}>{formatNum(barHover.keystrokes)} keys</span>
                {barHover.seconds > 0 && avgDailySeconds > 0 && (
                  <span className={barHover.diffVsAvg >= 0 ? 'text-accent/80' : 'text-amber-300/80'} style={{ fontSize: 10 }}>
                    {barHover.diffVsAvg >= 0 ? '+' : '−'}{formatDuration(Math.abs(barHover.diffVsAvg))}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-between mt-1">
          {range === '7d' ? (
            filledData.map((d) => (
              <span key={d.date} className="text-[7px] text-gray-600 font-mono">{getDayLabel(d.date)}</span>
            ))
          ) : (
            <>
              <span className="text-[7px] text-gray-600 font-mono">{getShortDate(filledData[0]?.date || '')}</span>
              <span className="text-[7px] text-gray-600 font-mono">{getShortDate(filledData[Math.floor(filledData.length / 2)]?.date || '')}</span>
              <span className="text-[7px] text-gray-600 font-mono">{getShortDate(filledData[filledData.length - 1]?.date || '')}</span>
            </>
          )}
        </div>
      </div>

      {/* Contribution Heatmap */}
      <div className="rounded-card bg-surface-2/80 border border-white/10 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-micro uppercase tracking-wider text-gray-500 font-mono">Activity Heatmap · 90 days</p>
          <span className="text-micro text-gray-600 font-mono">{heatmapRanks.total} active / 90</span>
        </div>
        <div className="flex gap-0.5 relative" onMouseLeave={() => setHeatHover(null)}>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5 flex-1">
              {week.map((day) => {
                const isActive = heatHover?.date === day.date
                return (
                  <div
                    key={day.date}
                    className={`aspect-square rounded-[2px] transition-all cursor-pointer ${isActive ? 'ring-1 ring-accent/80' : ''}`}
                    style={{ backgroundColor: getHeatColor(day.seconds) }}
                    onMouseEnter={(e) => {
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                      setHeatHover({
                        x: rect.left + rect.width / 2,
                        y: rect.top,
                        date: day.date,
                        seconds: day.seconds,
                        rank: heatmapRanks.map.get(day.date) || 0,
                        total: heatmapRanks.total,
                      })
                    }}
                  />
                )
              })}
            </div>
          ))}
          {heatHover && (
            <div
              className="fixed z-50 pointer-events-none rounded px-2 py-1.5 text-xs font-mono leading-tight"
              style={{
                left: Math.min(Math.max(heatHover.x - 80, 8), (typeof window !== 'undefined' ? window.innerWidth : 800) - 168),
                top: heatHover.y - 60,
                background: 'rgba(15,14,26,0.97)',
                border: '1px solid rgba(0,255,136,0.3)',
                color: '#eae6f5',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                whiteSpace: 'nowrap',
                width: 160,
              }}
            >
              <div className="text-gray-500" style={{ fontSize: 10 }}>{formatFullDate(heatHover.date)}</div>
              {heatHover.seconds > 0 ? (
                <div className="flex items-baseline justify-between">
                  <span className="text-accent font-bold">{formatDuration(heatHover.seconds)}</span>
                  {heatHover.rank > 0 && (
                    <span className="text-gray-600" style={{ fontSize: 10 }}>#{heatHover.rank} of {heatHover.total}</span>
                  )}
                </div>
              ) : (
                <div className="text-gray-600">no activity</div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-1 mt-2">
          <span className="text-micro text-gray-600 font-mono">Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
            <div
              key={i}
              className="w-2.5 h-2.5 rounded-[2px]"
              style={{ backgroundColor: v === 0 ? 'rgba(255,255,255,0.03)' : `rgba(0,255,136,${v * 0.75})` }}
            />
          ))}
          <span className="text-micro text-gray-600 font-mono">More</span>
        </div>
      </div>
    </div>
  )
})
