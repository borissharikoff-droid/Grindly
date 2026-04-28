import { useDelveStore, selectActiveRun } from '../../stores/delveStore'
import { useNavigationStore } from '../../stores/navigationStore'
import { Star, ChevronRight } from '../../lib/icons'

/**
 * Ambient strip shown on the Home page (and elsewhere) while a Delve run is
 * active. Mirrors the active-raid ambient pattern. Shows current floor + HP%
 * and links straight back to the Delve tab.
 */
export function DelveAmbientBar() {
  const run = useDelveStore(selectActiveRun)
  const battleState = useDelveStore((s) => s.getBattleState)()
  const navigateTo = useNavigationStore((s) => s.navigateTo)

  if (!run) return null

  const maxHp = run.playerSnapshot.hp || 1
  const currentHp = battleState?.playerHp ?? run.playerHp
  const hpPct = Math.max(0, Math.min(100, (currentHp / maxHp) * 100))
  const danger = hpPct < 30
  const isHc = run.mode === 'hardcore'
  const spec = run.currentFloorSpec

  let phase = 'in combat'
  if (spec?.kind === 'rest') phase = 'safe sector'
  else if (spec?.kind === 'rubicon') phase = 'beacon — pick perk'
  else if (spec?.kind === 'boss') phase = 'boss encounter'

  return (
    <div
      className={`mx-4 mt-2 mb-0 rounded border bg-white/[0.03] px-3 py-2 flex items-center gap-2 ${
        isHc ? 'border-red-500/30' : 'border-delve/30'
      }`}
    >
      <Star className={`w-4 h-4 shrink-0 ${isHc ? 'text-red-400' : 'text-delve'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white/90 truncate">
          Drift · Sector {run.currentFloor}
          <span className={`ml-1.5 text-micro font-mono uppercase ${isHc ? 'text-red-400' : 'text-delve/80'}`}>
            {isHc ? 'HC' : 'Practice'}
          </span>
        </p>
        <p className="text-micro font-mono text-gray-500 mt-0.5">
          {phase} · {run.runFragments} ✦
        </p>
      </div>
      <span className={`text-micro font-mono shrink-0 tabular-nums ${danger ? 'text-red-400 font-bold' : 'text-gray-400'}`}>
        {hpPct.toFixed(0)}% HP
      </span>
      <button
        type="button"
        onClick={() => navigateTo?.('delve')}
        className="shrink-0 text-micro font-mono px-2 py-1 rounded border border-white/12 bg-white/[0.04] text-gray-300 hover:text-white hover:bg-white/[0.08] transition-colors flex items-center"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
