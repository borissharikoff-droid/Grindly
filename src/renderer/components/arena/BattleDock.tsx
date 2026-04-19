import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useArenaStore } from '../../stores/arenaStore'
import { useNavigationStore } from '../../stores/navigationStore'
import { playClickSound } from '../../lib/sounds'
import type { TabId } from '../../App'

interface Props {
  activeTab: TabId
}

export function BattleDock({ activeTab }: Props) {
  const activeBattle = useArenaStore((s) => s.activeBattle)
  const getBattleState = useArenaStore((s) => s.getBattleState)
  const navigateTo = useNavigationStore((s) => s.navigateTo)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!activeBattle) return
    const id = setInterval(() => setTick((t) => t + 1), 250)
    return () => clearInterval(id)
  }, [activeBattle])
  void tick

  if (activeTab === 'arena' || !activeBattle) return null
  const state = getBattleState()
  if (!state) return null

  const bossMax = activeBattle.bossSnapshot.hp
  const playerMax = activeBattle.playerSnapshot.hp
  const bossPct = Math.max(0, Math.min(100, (state.bossHp / bossMax) * 100))
  const playerPct = Math.max(0, Math.min(100, (state.playerHp / playerMax) * 100))

  return (
    <AnimatePresence>
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        onClick={() => { playClickSound(); navigateTo?.('arena') }}
        title="Return to Arena"
        className="fixed bottom-4 right-4 z-40 w-[220px] rounded-card bg-surface-2/95 backdrop-blur border border-white/10 shadow-xl px-3 py-2 text-left hover:border-red-400/40 transition-colors"
      >
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs">⚔</span>
          <span className="text-caption font-semibold text-white truncate flex-1">
            {activeBattle.bossSnapshot.name}
          </span>
          <span className="text-micro text-gray-500 font-mono shrink-0">
            {activeBattle.isMob ? 'mob' : 'boss'}
          </span>
        </div>
        <div className="space-y-1">
          <Bar label="HP" pct={playerPct} color="#22c55e" value={`${Math.ceil(state.playerHp)}/${playerMax}`} />
          <Bar label="Boss" pct={bossPct} color="#ef4444" value={`${Math.ceil(state.bossHp)}/${bossMax}`} />
        </div>
      </motion.button>
    </AnimatePresence>
  )
}

function Bar({ label, pct, color, value }: { label: string; pct: number; color: string; value: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-micro font-mono text-gray-500 mb-0.5">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-black/40 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}
