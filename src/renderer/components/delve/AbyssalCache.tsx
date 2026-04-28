import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useDelveStore, selectBankedFragments, selectMetaUpgradeRanks, selectUnlockedCacheItems } from '../../stores/delveStore'
import { META_UPGRADES, getNextRankCost, type MetaUpgradeDef, type MetaUpgradeTrack } from '../../lib/delveMetaUpgrades'
import { CACHE_ITEMS } from '../../lib/delveCacheItems'
import { Sparkles, X } from '../../lib/icons'
import { playClickSound } from '../../lib/sounds'

type CacheTab = 'upgrades' | 'items'

const TRACK_LABEL: Record<MetaUpgradeTrack, string> = {
  stat: 'Stats',
  survival: 'Survival',
  run: 'Run',
}

export function AbyssalCache({ onClose }: { onClose: () => void }) {
  const banked = useDelveStore(selectBankedFragments)
  const ranks = useDelveStore(selectMetaUpgradeRanks)
  const unlockedItems = useDelveStore(selectUnlockedCacheItems)
  const purchaseUpgrade = useDelveStore((s) => s.purchaseMetaUpgrade)
  const purchaseItem = useDelveStore((s) => s.purchaseCacheItem)
  const [tab, setTab] = useState<CacheTab>('upgrades')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const groupedUpgrades = useMemo(() => {
    const groups: Record<MetaUpgradeTrack, MetaUpgradeDef[]> = { stat: [], survival: [], run: [] }
    for (const m of META_UPGRADES) groups[m.track].push(m)
    return groups
  }, [])

  const totalRanks = META_UPGRADES.reduce((acc, m) => acc + (ranks[m.id] ?? 0), 0)
  const maxTotalRanks = META_UPGRADES.reduce((acc, m) => acc + m.costs.length, 0)

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, transition: { duration: 0.18 } }}
        className="bg-surface-1 rounded-card border border-delve/20 w-full max-w-2xl max-h-[88vh] flex flex-col shadow-modal overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-4 py-3 border-b border-white/[0.06] bg-gradient-to-b from-delve/[0.08] to-transparent">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded border border-delve/40 bg-delve-muted flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-delve" />
              </div>
              <div className="min-w-0">
                <p className="font-display text-base font-semibold text-white tracking-wide leading-tight">Stellar Cache</p>
                <p className="text-micro text-gray-500 font-mono truncate">spend shards on permanent boosts</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-delve/40 bg-delve-muted">
                <Sparkles className="w-3.5 h-3.5 text-delve" />
                <span className="font-mono text-caption font-bold text-delve tabular-nums">{banked}</span>
                <span className="text-micro text-delve/70 font-mono uppercase">shards</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-7 h-7 rounded text-gray-500 hover:text-white hover:bg-white/[0.06] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-3 pt-2 border-b border-white/[0.06]">
          <TabButton active={tab === 'upgrades'} onClick={() => { playClickSound(); setTab('upgrades') }}>
            Upgrades <span className="text-micro font-mono opacity-60">({totalRanks}/{maxTotalRanks})</span>
          </TabButton>
          <TabButton active={tab === 'items'} onClick={() => { playClickSound(); setTab('items') }}>
            Items <span className="text-micro font-mono opacity-60">({unlockedItems.length}/{CACHE_ITEMS.length})</span>
          </TabButton>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-3 flex-1">
          {tab === 'upgrades' ? (
            <div className="space-y-3">
              {(['stat', 'survival', 'run'] as MetaUpgradeTrack[]).map((track) => {
                const list = groupedUpgrades[track]
                if (!list.length) return null
                return (
                  <section key={track} className="space-y-1.5">
                    <p className="text-micro uppercase tracking-wider text-gray-500 font-mono px-1">{TRACK_LABEL[track]}</p>
                    <div className="space-y-1.5">
                      {list.map((def) => (
                        <UpgradeRow
                          key={def.id}
                          def={def}
                          rank={ranks[def.id] ?? 0}
                          banked={banked}
                          onBuy={() => { playClickSound(); purchaseUpgrade(def.id) }}
                        />
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {CACHE_ITEMS.map((item) => {
                const owned = unlockedItems.includes(item.id)
                const canAfford = banked >= item.cost
                return (
                  <div
                    key={item.id}
                    className={`rounded-card border p-3 flex flex-col ${
                      owned
                        ? 'border-amber-500/30 bg-amber-500/[0.05]'
                        : 'border-white/[0.06] bg-surface-2'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="w-11 h-11 rounded border border-white/10 bg-surface-3 flex items-center justify-center text-2xl leading-none">{item.icon}</div>
                      {owned && <span className="text-micro font-mono uppercase font-bold text-amber-400 mt-1">owned</span>}
                    </div>
                    <p className="text-caption font-bold text-white mb-0.5">{item.name}</p>
                    <p className="text-micro text-gray-400 leading-snug min-h-[44px] mb-2.5 flex-1">{item.description}</p>
                    <button
                      type="button"
                      onClick={() => { playClickSound(); purchaseItem(item.id) }}
                      disabled={owned || !canAfford}
                      className={`w-full py-1.5 rounded text-caption font-bold font-mono flex items-center justify-center gap-1 transition-colors ${
                        owned
                          ? 'border border-white/10 bg-surface-3 text-gray-500 cursor-default'
                          : canAfford
                            ? 'border border-delve/40 bg-delve-muted text-delve hover:bg-delve/25'
                            : 'border border-white/10 bg-surface-3 text-gray-600 cursor-not-allowed'
                      }`}
                    >
                      {owned ? 'Acquired' : <><Sparkles className="w-3 h-3" />{item.cost}</>}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

function UpgradeRow({
  def, rank, banked, onBuy,
}: {
  def: MetaUpgradeDef
  rank: number
  banked: number
  onBuy: () => void
}) {
  const maxRank = def.costs.length
  const nextCost = getNextRankCost(def.id, rank)
  const isMaxed = nextCost === null
  const canAfford = nextCost !== null && banked >= nextCost
  const currentEffect = rank > 0 ? def.perRank[rank - 1].label : null
  const nextEffect = !isMaxed ? def.perRank[rank].label : null

  return (
    <div
      className={`rounded border px-3 py-2.5 flex items-center gap-3 transition-colors ${
        isMaxed
          ? 'border-amber-500/25 bg-amber-500/[0.04]'
          : 'border-white/[0.06] bg-surface-2'
      }`}
    >
      <div
        className={`w-10 h-10 rounded border flex items-center justify-center text-lg shrink-0 ${
          isMaxed
            ? 'border-amber-500/30 bg-amber-500/[0.08]'
            : rank > 0
              ? 'border-delve/30 bg-delve-muted'
              : 'border-white/10 bg-surface-3'
        }`}
      >
        {def.icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="text-caption font-bold text-white truncate">{def.name}</p>
          <span className="text-micro font-mono text-gray-500 tabular-nums shrink-0">{rank}/{maxRank}</span>
        </div>
        <p className="text-micro text-gray-500 leading-snug truncate">{def.description}</p>
        {/* Rank pips */}
        <div className="flex gap-0.5 mt-1.5">
          {Array.from({ length: maxRank }, (_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${
                i < rank
                  ? isMaxed ? 'bg-amber-400/80' : 'bg-delve'
                  : 'bg-white/[0.06]'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="text-right shrink-0 min-w-[96px] flex flex-col items-end gap-1">
        {isMaxed ? (
          <>
            <span className="px-2 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-micro font-mono uppercase font-bold text-amber-400 tracking-wider">MAX</span>
            {currentEffect && <p className="text-micro font-mono text-amber-400/80 leading-tight">{currentEffect}</p>}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onBuy}
              disabled={!canAfford}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-caption font-bold font-mono transition-colors ${
                canAfford
                  ? 'border border-delve/40 bg-delve-muted text-delve hover:bg-delve/25'
                  : 'border border-white/10 bg-surface-3 text-gray-600 cursor-not-allowed'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span className="tabular-nums">{nextCost}</span>
            </button>
            <p className="text-micro font-mono text-gray-500 leading-tight">
              <span className="text-delve/80">→</span> {nextEffect}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-caption font-semibold transition-colors border-b-2 -mb-px ${
        active
          ? 'text-delve border-delve'
          : 'text-gray-500 border-transparent hover:text-gray-300'
      }`}
    >
      {children}
    </button>
  )
}
