import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useInventoryStore } from '../../stores/inventoryStore'
import { useDelveStore } from '../../stores/delveStore'
import { CharacterCard } from '../character/CharacterCard'
import { FoodSelector } from '../shared/FoodSelector'
import type { FoodLoadoutSlot } from '../../lib/combat'
import { X, Skull, Shield, Sparkles, Rocket, AlertTriangle, Package } from '../../lib/icons'
import { playClickSound } from '../../lib/sounds'
import { getStartingFragments, getRunInventoryCap } from '../../lib/delveMetaUpgrades'

export function DelveStakeModal({
  mode, onClose, onStarted,
}: {
  mode: 'casual' | 'hardcore'
  onClose: () => void
  onStarted: () => void
}) {
  const inv = useInventoryStore()
  const stakeAndStart = useDelveStore((s) => s.stakeAndStart)
  const metaRanks = useDelveStore((s) => s.metaUpgradeRanks)
  const [foodSlots, setFoodSlots] = useState<(FoodLoadoutSlot | null)[]>([null, null, null])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  function handleStart() {
    const ok = stakeAndStart(mode, {
      equipped: { ...inv.equippedBySlot },
      items: {},
      food: foodSlots,
    })
    if (ok) onStarted()
  }

  const isHc = mode === 'hardcore'
  const tc = isHc ? '#ef4444' : '#5865F2'
  const startingShards = getStartingFragments(metaRanks)
  const inventoryCap = getRunInventoryCap(metaRanks)
  const shardMultiplier = isHc ? '1.5×' : '1×'

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, transition: { duration: 0.18 } }}
        className="bg-surface-2 rounded-card border border-white/[0.06] w-full max-w-lg flex flex-col shadow-modal overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — mode-tinted gradient strip */}
        <div
          className="relative px-4 py-3 border-b border-white/[0.06]"
          style={{ background: `linear-gradient(180deg, ${tc}14 0%, transparent 100%)` }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-9 h-9 rounded border flex items-center justify-center shrink-0"
                style={{ borderColor: `${tc}55`, background: `${tc}1a` }}
              >
                {isHc
                  ? <Skull className="w-4 h-4" style={{ color: tc }} />
                  : <Shield className="w-4 h-4" style={{ color: tc }} />}
              </div>
              <div className="min-w-0">
                <p className="font-display text-base font-semibold text-white tracking-wide leading-tight">Prepare for launch</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="text-micro font-bold font-mono px-1.5 py-px rounded border leading-none"
                    style={{ borderColor: `${tc}55`, background: `${tc}1f`, color: isHc ? '#fca5a5' : '#a5b4fc' }}
                  >
                    {isHc ? 'HARDCORE' : 'PRACTICE'}
                  </span>
                  <span className="text-micro font-mono text-gray-500">{shardMultiplier} shards</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded text-gray-500 hover:text-white hover:bg-white/[0.06] flex items-center justify-center shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {/* Mode-specific notice */}
          {isHc ? (
            <div className="rounded border border-red-500/25 bg-red-500/[0.06] px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-caption font-semibold text-red-300 leading-tight">Equipped gear is staked</p>
                <p className="text-micro text-red-400/70 font-mono mt-0.5">
                  Die out in the void and your equipped items are lost. Extract early to keep them.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded border border-accent/25 bg-accent/[0.06] px-3 py-2 flex items-start gap-2">
              <Shield className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-caption font-semibold text-accent leading-tight">Practice run — gear is safe</p>
                <p className="text-micro text-gray-500 font-mono mt-0.5">
                  Your equipped gear stays in your inventory whether you extract or die.
                </p>
              </div>
            </div>
          )}

          {/* Starting bonuses strip */}
          <div className="rounded border border-white/[0.06] bg-surface-1 grid grid-cols-2 divide-x divide-white/[0.06]">
            <div className="px-3 py-2">
              <div className="flex items-center gap-1 mb-0.5">
                <Sparkles className="w-3 h-3 text-delve" />
                <p className="text-micro uppercase tracking-wider text-gray-500 font-mono">Starting shards</p>
              </div>
              <p className="font-mono text-body font-bold tabular-nums text-delve">+{startingShards}</p>
            </div>
            <div className="px-3 py-2">
              <div className="flex items-center gap-1 mb-0.5">
                <Package className="w-3 h-3 text-gray-500" />
                <p className="text-micro uppercase tracking-wider text-gray-500 font-mono">Run capacity</p>
              </div>
              <p className="font-mono text-body font-bold tabular-nums text-gray-300">{inventoryCap} slots</p>
            </div>
          </div>

          {/* Character — same component Arena uses */}
          <CharacterCard locked />

          {/* Food — same shared selector Arena uses */}
          <FoodSelector
            slots={foodSlots}
            onChange={setFoodSlots}
            ownedItems={inv.items}
          />
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/[0.06] bg-surface-1 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded border border-white/10 text-gray-300 text-caption hover:bg-white/[0.06] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { playClickSound(); handleStart() }}
            className="flex-1 py-2.5 rounded-card text-sm font-bold tracking-wider transition-all active:scale-[0.98] flex items-center justify-center gap-2 group"
            style={{
              background: `linear-gradient(135deg, ${tc}38, ${tc}1a)`,
              border: `1px solid ${tc}66`,
              color: '#fff',
              textShadow: `0 0 12px ${tc}`,
              boxShadow: `inset 0 1px 0 0 rgba(255,255,255,0.06)`,
            }}
          >
            <Rocket className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" style={{ filter: `drop-shadow(0 0 6px ${tc})` }} />
            <span>LAUNCH RUN</span>
          </button>
        </div>
      </motion.div>
    </div>
  )
}
