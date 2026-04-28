import { useEffect, useRef, forwardRef } from 'react'
import { motion } from 'framer-motion'
import { useDelveStore, selectActiveRun } from '../../stores/delveStore'
import { getFloorKind, type FloorKind } from '../../lib/delveGen'

/** Map window: how many cleared floors and how many upcoming floors to render around current. */
const MAP_PAST_WINDOW = 5
const MAP_FUTURE_WINDOW = 12
import { Star, X, Skull, Sparkles, Rocket, Sword, Check } from '../../lib/icons'

/**
 * Vertical map of all sectors in the current run. Uses generator helpers
 * (deterministic per floor#) so we can show kind icons for upcoming sectors
 * without spoiling the random mob roll.
 */
export function DelveMap({ onClose }: { onClose: () => void }) {
  const run = useDelveStore(selectActiveRun)
  const currentRowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Scroll the current sector into view on open
  useEffect(() => {
    const t = setTimeout(() => {
      currentRowRef.current?.scrollIntoView({ behavior: 'auto', block: 'center' })
    }, 50)
    return () => clearTimeout(t)
  }, [])

  if (!run) return null

  const startFloor = Math.max(1, run.currentFloor - MAP_PAST_WINDOW)
  const endFloor = run.currentFloor + MAP_FUTURE_WINDOW
  const sectors: { floor: number; kind: FloorKind }[] = []
  for (let f = startFloor; f <= endFloor; f++) {
    sectors.push({ floor: f, kind: getFloorKind(f) })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, transition: { duration: 0.18 } }}
        className="bg-surface-2 rounded-card border border-white/[0.06] w-full max-w-md max-h-[85vh] flex flex-col shadow-modal overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-gradient-to-b from-delve/[0.06] to-transparent">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-delve" />
            <p className="font-display text-base font-semibold text-white tracking-wide">Stellar Map</p>
            <span className="text-micro font-mono text-gray-500">
              sector <span className="text-white">{run.currentFloor}</span> · endless
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded text-gray-500 hover:text-white hover:bg-white/[0.06] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body — scrollable list, sector 1 at top, deepest at bottom */}
        <div className="overflow-y-auto p-3">
          <div className="relative">
            {sectors.map((s, i) => {
              const isCurrent = s.floor === run.currentFloor
              const isPast = s.floor < run.currentFloor
              const isLast = i === sectors.length - 1
              return (
                <SectorRow
                  key={s.floor}
                  ref={isCurrent ? currentRowRef : undefined}
                  floor={s.floor}
                  kind={s.kind}
                  status={isCurrent ? 'current' : isPast ? 'past' : 'future'}
                  isLast={isLast}
                />
              )
            })}
          </div>
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-white/[0.06] flex items-center justify-between text-micro font-mono text-gray-600">
          <span>endless drift — boss every 10 sectors, beacons mid-cycle</span>
        </div>
      </motion.div>
    </div>
  )
}

interface SectorRowProps {
  floor: number
  kind: FloorKind
  status: 'past' | 'current' | 'future'
  isLast: boolean
}

const KIND_META: Record<FloorKind, { Icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
  wave:    { Icon: Sword,    label: 'enemies',         color: 'text-gray-400' },
  boss:    { Icon: Skull,    label: 'boss',            color: 'text-red-400' },
  rest:    { Icon: Star,     label: 'safe sector',     color: 'text-emerald-400' },
  rubicon: { Icon: Sparkles, label: 'beacon — perk',   color: 'text-delve' },
}

const SectorRow = forwardRef<HTMLDivElement, SectorRowProps>(function SectorRow(
  { floor, kind, status, isLast },
  ref,
) {
  const meta = KIND_META[kind]
  const isPast = status === 'past'
  const isCurrent = status === 'current'

  const nodeBg = isCurrent
    ? 'bg-delve text-white border-delve shadow-[0_0_20px_-4px_rgba(167,139,250,0.7)]'
    : isPast
      ? 'bg-surface-3 text-gray-600 border-white/10'
      : kind === 'boss'
        ? 'bg-red-500/15 text-red-300 border-red-500/40'
        : kind === 'rubicon'
          ? 'bg-delve/12 text-delve border-delve/40'
          : kind === 'rest'
            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
            : 'bg-surface-3 text-gray-300 border-white/10'

  const labelColor = isPast ? 'text-gray-600' : isCurrent ? 'text-white font-bold' : meta.color
  const subLabel = isPast ? 'cleared' : isCurrent ? 'YOU ARE HERE' : meta.label

  return (
    <div ref={ref} className="flex items-stretch gap-3">
      {/* Left rail: node + connector */}
      <div className="flex flex-col items-center w-9">
        <div
          className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${nodeBg}`}
          title={`Sector ${floor} — ${meta.label}`}
        >
          {isCurrent
            ? <Rocket className="w-3.5 h-3.5" />
            : isPast
              ? <Check className="w-3.5 h-3.5" />
              : <meta.Icon className="w-3.5 h-3.5" />}
        </div>
        {!isLast && (
          <div
            className={`w-px flex-1 ${isPast ? 'bg-white/10' : 'bg-white/[0.08]'}`}
            style={{ minHeight: '20px' }}
          />
        )}
      </div>

      {/* Right: label */}
      <div className={`flex-1 pb-3 pt-0.5 ${isPast ? 'opacity-60' : ''}`}>
        <p className={`text-caption ${labelColor}`}>
          Sector {floor}
          {(kind === 'boss' || kind === 'rubicon' || kind === 'rest') && (
            <span className="ml-1.5 text-micro font-mono uppercase tracking-wider opacity-80">
              {kind === 'rubicon' ? 'beacon' : kind}
            </span>
          )}
        </p>
        <p className={`text-micro font-mono ${isCurrent ? 'text-delve' : 'text-gray-500'}`}>
          {subLabel}
        </p>
      </div>
    </div>
  )
})
