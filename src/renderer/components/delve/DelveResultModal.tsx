import { useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Rocket, Skull, Coins, Sparkles, Sword, X, Star } from '../../lib/icons'
import { LOOT_ITEMS } from '../../lib/loot'
import { resolveItemDisplay } from '../../lib/itemLookup'
import { LootVisual, RARITY_THEME } from '../loot/LootUI'
import type { PendingResult } from '../../stores/delveStore'

/**
 * Unified post-run modal — shows for both extract (success) and death (failure).
 * Driven by `delveStore.pendingResult`. Stays visible across tab switches until
 * user clicks Done — so an off-tab end isn't lost in the void.
 */
export function DelveResultModal({ result, onClose }: { result: PendingResult; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, transition: { duration: 0.2 } }}
        className="max-w-md w-full max-h-[90vh] flex flex-col rounded-card border border-white/[0.06] bg-surface-2 shadow-modal overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 rounded text-gray-500 hover:text-white hover:bg-white/[0.06] flex items-center justify-center z-10"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex-1 overflow-y-auto">
          {result.kind === 'extract' ? <ExtractContent result={result} /> : <DeathContent result={result} />}
        </div>
        <div className="px-5 pb-5 pt-2 border-t border-white/[0.04] bg-surface-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-card font-bold text-sm tracking-wider transition-all active:scale-[0.99] flex items-center justify-center"
            style={
              result.kind === 'extract'
                ? {
                    background: 'linear-gradient(135deg, rgba(167,139,250,0.30), rgba(167,139,250,0.12))',
                    border: '1px solid rgba(167,139,250,0.45)',
                    color: '#fff',
                    textShadow: '0 0 12px rgba(167,139,250,0.6)',
                  }
                : {
                    background: 'linear-gradient(135deg, rgba(239,68,68,0.25), rgba(239,68,68,0.10))',
                    border: '1px solid rgba(239,68,68,0.45)',
                    color: '#fff',
                    textShadow: '0 0 10px rgba(239,68,68,0.5)',
                  }
            }
          >
            DONE
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function ExtractContent({ result }: { result: Extract<PendingResult, { kind: 'extract' }> }) {
  const r = result.data

  // Aggregate loot: chests by tier (rarity), other items by id, ignore gold (already in goldGained)
  const aggregated = useMemo(() => {
    const chests: Record<string, number> = {}
    const items: Record<string, number> = {}
    for (const l of r.lootGranted) {
      if (l.kind === 'gold') continue
      if (l.kind === 'chest') chests[l.id] = (chests[l.id] ?? 0) + l.qty
      else items[l.id] = (items[l.id] ?? 0) + l.qty
    }
    return { chests, items }
  }, [r.lootGranted])

  const chestEntries = Object.entries(aggregated.chests)
  const itemEntries = Object.entries(aggregated.items)
  const totalLoot = chestEntries.length + itemEntries.length
  const netGold = r.goldGained - r.taxPaid

  return (
    <div className="px-5 pt-5 pb-3 text-center">
      {/* Hero */}
      <motion.div
        className="flex justify-center mb-2"
        initial={{ y: 16, opacity: 0, rotate: -8 }}
        animate={{ y: 0, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 180, damping: 14, delay: 0.05 }}
      >
        <Rocket className="w-10 h-10 text-delve" style={{ filter: 'drop-shadow(0 0 14px rgba(167,139,250,0.55))' }} />
      </motion.div>
      <motion.p
        initial={{ y: 6, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.18 }}
        className="font-display text-xl font-semibold text-white mb-0.5"
      >
        Returned to base
      </motion.p>
      <motion.p
        initial={{ y: 6, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.24 }}
        className="text-caption text-gray-400 mb-4"
      >
        Reached sector <span className="font-mono text-white font-bold">{r.finalFloor}</span>
      </motion.p>

      {/* Headline reward strip — gold + shards in big chunky chips */}
      <motion.div
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.32 }}
        className="grid grid-cols-2 gap-2 mb-3"
      >
        <RewardChip
          icon={<Coins className="w-4 h-4 text-amber-400" />}
          label="Gold"
          value={`+${netGold}`}
          sub={r.taxPaid > 0 ? `gross +${r.goldGained} · tax −${r.taxPaid}` : undefined}
          tone="amber"
        />
        <RewardChip
          icon={<Sparkles className="w-4 h-4 text-delve" />}
          label="Shards banked"
          value={`+${r.fragmentsBanked}`}
          tone="delve"
        />
      </motion.div>

      {/* Loot showcase — actual visual loot, chips with rarity colors */}
      {totalLoot > 0 && (
        <motion.div
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="rounded-card border border-white/[0.06] bg-surface-1 p-3 mb-3 text-left"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-micro uppercase tracking-wider text-gray-500 font-mono">Loot recovered</p>
            <p className="text-micro font-mono text-gray-500 tabular-nums">{r.lootGranted.filter((l) => l.kind !== 'gold').length} items</p>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
            {chestEntries.map(([id, qty], i) => (
              <LootChip key={`c-${id}`} id={id} qty={qty} delay={0.45 + i * 0.04} />
            ))}
            {itemEntries.map(([id, qty], i) => (
              <LootChip key={`i-${id}`} id={id} qty={qty} delay={0.45 + (chestEntries.length + i) * 0.04} />
            ))}
          </div>
        </motion.div>
      )}

      {/* Secondary stats — XP + skin unlocks */}
      <motion.div
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.55 }}
        className="space-y-1 text-left mb-1"
      >
        <ResultRow label="Warrior XP" value={`+${r.warriorXpGranted}`} icon={<Sword className="w-3 h-3 text-orange-300" />} />
        {r.cosmeticsUnlocked.length > 0 && (
          <ResultRow
            label="New skins unlocked"
            value={`${r.cosmeticsUnlocked.length}`}
            icon={<Star className="w-3 h-3 text-amber-400" />}
            tone="amber"
            emphasis
          />
        )}
      </motion.div>
    </div>
  )
}

function DeathContent({ result }: { result: Extract<PendingResult, { kind: 'death' }> }) {
  const r = result.data
  const isHc = result.mode === 'hardcore'
  const lostItemEntries = Object.entries(r.itemsLost).filter(([, qty]) => qty > 0)
  const lostEquipped = Object.values(r.equippedLost).filter((id): id is string => Boolean(id))
  return (
    <div className="px-5 pt-5 pb-3 text-center">
      <div className="flex justify-center mb-2">
        <Skull className="w-10 h-10 text-red-400" style={{ filter: 'drop-shadow(0 0 12px rgba(239,68,68,0.55))' }} />
      </div>
      <p className="font-display text-xl font-semibold text-white mb-0.5">Drift ended</p>
      <p className="text-caption text-gray-400 mb-5">
        Fell on sector <span className="font-mono text-white font-bold">{r.finalFloor}</span>
        {isHc && <span className="text-red-400"> · hardcore</span>}
      </p>

      <div className="space-y-2 text-left mb-3">
        {isHc && lostEquipped.length > 0 && (
          <div className="rounded-card border border-red-500/25 bg-red-500/[0.04] p-3">
            <p className="text-micro font-mono uppercase tracking-wider text-red-400/80 mb-2">Equipment destroyed</p>
            <div className="flex flex-wrap gap-1.5">
              {lostEquipped.map((id) => {
                const def = LOOT_ITEMS.find((x) => x.id === id)
                return (
                  <span key={id} className="px-1.5 py-1 rounded border border-red-500/30 bg-red-500/[0.08] text-micro text-red-300 inline-flex items-center gap-1.5" title={def?.name ?? id}>
                    <Sword className="w-3 h-3" />{def?.name ?? id}
                  </span>
                )
              })}
            </div>
          </div>
        )}
        {isHc && lostItemEntries.length > 0 && (
          <div className="rounded-card border border-red-500/25 bg-red-500/[0.04] p-3">
            <p className="text-micro font-mono uppercase tracking-wider text-red-400/80 mb-2">Items lost</p>
            <div className="flex flex-wrap gap-1.5">
              {lostItemEntries.map(([id, qty]) => {
                const display = resolveItemDisplay(id)
                return (
                  <span key={id} className="px-1.5 py-1 rounded border border-red-500/30 bg-red-500/[0.08] text-micro inline-flex items-center gap-1.5">
                    <LootVisual icon={display.icon} image={display.image} className="w-4 h-4 object-contain" scale={1} />
                    <span className="text-red-300">{display.name}</span>
                    <span className="text-red-400 font-mono">×{qty}</span>
                  </span>
                )
              })}
            </div>
          </div>
        )}
        {!isHc && (
          <p className="text-caption text-gray-500 text-center py-2">Practice run — gear is safe.</p>
        )}
      </div>
    </div>
  )
}

function LootChip({ id, qty, delay }: { id: string; qty: number; delay: number }) {
  const display = resolveItemDisplay(id)
  const rarity = display.rarity === 'mythic' ? 'mythical' : display.rarity
  const theme = RARITY_THEME[rarity]
  return (
    <motion.span
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 22, delay }}
      title={`${display.name}${qty > 1 ? ` ×${qty}` : ''}`}
      className="pl-1 pr-2 py-0.5 rounded-full text-micro font-mono inline-flex items-center gap-1 border max-w-[160px]"
      style={{ borderColor: theme.border, background: `${theme.color}15`, color: theme.color }}
    >
      <LootVisual icon={display.icon} image={display.image} className="w-4 h-4 object-contain shrink-0" scale={1} />
      <span className="truncate">{display.name}</span>
      {qty > 1 && <span className="tabular-nums shrink-0 opacity-80">×{qty}</span>}
    </motion.span>
  )
}

function RewardChip({ icon, label, value, sub, tone }: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  tone: 'amber' | 'delve'
}) {
  const styles = tone === 'amber'
    ? 'border-amber-500/30 bg-amber-500/[0.08]'
    : 'border-delve/30 bg-delve/[0.08]'
  const valueColor = tone === 'amber' ? 'text-amber-300' : 'text-delve'
  return (
    <div className={`rounded-card border ${styles} px-3 py-2 text-left`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        {icon}
        <p className="text-micro uppercase tracking-wider text-gray-400 font-mono">{label}</p>
      </div>
      <p className={`font-mono text-base font-bold tabular-nums ${valueColor}`}>{value}</p>
      {sub && <p className="text-micro font-mono text-gray-600 mt-0.5 tabular-nums">{sub}</p>}
    </div>
  )
}

function ResultRow({ label, value, icon, tone, emphasis }: { label: string; value: string; icon?: React.ReactNode; tone?: 'red' | 'amber' | 'delve'; emphasis?: boolean }) {
  const valColor = tone === 'red' ? 'text-red-400' : tone === 'amber' ? 'text-amber-400' : tone === 'delve' ? 'text-delve' : 'text-white'
  const emphasisCls = emphasis
    ? `px-2 py-1.5 rounded border ${tone === 'delve' ? 'border-delve/30 bg-delve/[0.06]' : tone === 'amber' ? 'border-amber-500/30 bg-amber-500/[0.06]' : 'border-white/[0.06] bg-surface-1'}`
    : 'px-1'
  return (
    <div className={`flex justify-between items-center text-caption ${emphasisCls}`}>
      <span className={`inline-flex items-center gap-1.5 ${emphasis ? 'text-gray-300 font-semibold' : 'text-gray-500'}`}>
        {icon}{label}
      </span>
      <span className={`font-mono ${valColor} tabular-nums font-bold ${emphasis ? 'text-sm' : ''}`}>
        {value}
      </span>
    </div>
  )
}
