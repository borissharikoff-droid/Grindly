import { useGoldStore } from '../../stores/goldStore'

export function GoldDisplay() {
  const gold = useGoldStore((s) => s.gold)
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/12 border border-amber-500/25">
      <span className="text-amber-400" aria-hidden>🪙</span>
      <span className="text-sm font-bold text-amber-400 tabular-nums">{gold ?? 0}</span>
    </div>
  )
}
