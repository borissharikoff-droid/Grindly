import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useDelveStore, selectActiveRun } from '../../stores/delveStore'
import { pickRubiconOffers, type DelvePerkDef } from '../../lib/delvePerks'
import { getRubiconOfferConfig } from '../../lib/delveMetaUpgrades'
import { ChevronRight, Sparkles, Skull, Shield } from '../../lib/icons'

const PERK_TONE: Record<DelvePerkDef['rarity'], { border: string; bg: string; text: string; ring: string; iconBg: string; rarityChip: string; rarityText: string }> = {
  common: {
    border: 'border-white/15',
    bg: 'bg-surface-2 hover:bg-surface-3',
    text: 'text-gray-100',
    ring: 'ring-white/10',
    iconBg: 'bg-white/[0.06] border-white/15',
    rarityChip: 'border-white/15 bg-white/[0.04]',
    rarityText: 'text-gray-400',
  },
  rare: {
    border: 'border-sky-400/40',
    bg: 'bg-sky-500/[0.06] hover:bg-sky-500/[0.12]',
    text: 'text-sky-100',
    ring: 'ring-sky-400/25',
    iconBg: 'bg-sky-500/15 border-sky-400/40',
    rarityChip: 'border-sky-400/40 bg-sky-500/15',
    rarityText: 'text-sky-300',
  },
  epic: {
    border: 'border-purple-400/50',
    bg: 'bg-purple-500/[0.08] hover:bg-purple-500/[0.15]',
    text: 'text-purple-100',
    ring: 'ring-purple-400/30',
    iconBg: 'bg-purple-500/15 border-purple-400/40',
    rarityChip: 'border-purple-400/50 bg-purple-500/15',
    rarityText: 'text-purple-300',
  },
}

export function RubiconFloorView() {
  const run = useDelveStore(selectActiveRun)
  const purchasePerk = useDelveStore((s) => s.purchasePerk)
  const refundPerk = useDelveStore((s) => s.refundPerk)
  const advanceFloor = useDelveStore((s) => s.advanceFloor)
  const resolveCurrentRubicon = useDelveStore((s) => s.resolveCurrentRubicon)
  const metaRanks = useDelveStore((s) => s.metaUpgradeRanks)

  const cfg = useMemo(() => getRubiconOfferConfig(metaRanks), [metaRanks])
  const initialFragments = useMemo(() => run?.runFragments ?? 0, [run?.currentFloor, run?.seed])
  const offers = useMemo(() => {
    if (!run) return []
    return pickRubiconOffers(cfg.offers, run.seed, run.currentFloor, run.activePerks, initialFragments)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.seed, run?.currentFloor, cfg.offers, initialFragments])

  if (!run) return null

  function handleContinue() {
    if (!run) return
    resolveCurrentRubicon()
    advanceFloor()
  }

  const isHc = run.mode === 'hardcore'

  return (
    <div className="min-h-full flex flex-col justify-center p-4 pb-20 max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.3 } }}
        className="w-full space-y-4"
      >
        {/* Header */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center gap-2 mb-0.5">
            <span className="h-px w-8 bg-delve/30" />
            <p className="text-micro uppercase tracking-[0.4em] text-delve font-bold font-mono">
              Sector {run.currentFloor} · Beacon
            </p>
            <span className="h-px w-8 bg-delve/30" />
          </div>
          <h1 className="font-display text-2xl font-bold text-white tracking-wide">Pick a perk</h1>
          <p className="text-caption text-gray-500">
            Boost your stats for the rest of the run.
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <span
              className={`text-micro font-bold font-mono px-1.5 py-px rounded border leading-none ${
                isHc
                  ? 'bg-red-500/15 text-red-300 border-red-500/30'
                  : 'bg-accent/15 text-accent border-accent/30'
              }`}
            >
              {isHc ? <Skull className="w-2.5 h-2.5 inline mr-0.5" /> : <Shield className="w-2.5 h-2.5 inline mr-0.5" />}
              {isHc ? 'HARDCORE' : 'PRACTICE'}
            </span>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-delve/30 bg-delve/12 leading-none">
              <Sparkles className="w-3 h-3 text-delve" />
              <span className="font-mono text-caption font-bold text-delve tabular-nums">{run.runFragments}</span>
              <span className="text-micro text-delve/70 font-mono uppercase tracking-wider">shards</span>
            </div>
          </div>
        </div>

        {/* Perk offers */}
        <div className={`grid gap-2.5 ${offers.length === 1 ? 'grid-cols-1' : offers.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {offers.map((perk) => {
            const owned = run.activePerks.includes(perk.id)
            const canAfford = run.runFragments >= perk.cost
            const tone = PERK_TONE[perk.rarity]
            const interactive = owned || canAfford
            const shortBy = canAfford ? 0 : perk.cost - run.runFragments
            const handleClick = () => {
              if (owned) refundPerk(perk.id)
              else if (canAfford) purchasePerk(perk.id)
            }
            return (
              <motion.button
                key={perk.id}
                type="button"
                onClick={handleClick}
                disabled={!interactive}
                whileHover={interactive ? { y: -2 } : {}}
                title={owned ? 'Click to refund and free up shards' : canAfford ? 'Click to take' : `Need +${shortBy} shards`}
                className={`text-left rounded-card border p-3 transition-all flex flex-col overflow-hidden ${tone.border} ${tone.bg} ${
                  !interactive
                    ? 'opacity-55 cursor-not-allowed grayscale-[40%]'
                    : owned
                      ? `ring-2 ring-inset ${tone.ring} cursor-pointer`
                      : `ring-1 ring-inset ${tone.ring} cursor-pointer`
                }`}
              >
                {/* Icon + rarity badge */}
                <div className="flex items-start justify-between mb-2">
                  <div className={`w-11 h-11 rounded border flex items-center justify-center text-2xl leading-none shrink-0 ${tone.iconBg}`}>
                    {perk.image
                      ? <img src={perk.image} alt={perk.name} className="w-9 h-9 object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
                      : perk.icon}
                  </div>
                  <span className={`text-micro uppercase font-mono font-bold tracking-widest px-1.5 py-px rounded border leading-none ${tone.rarityChip} ${tone.rarityText}`}>
                    {perk.rarity}
                  </span>
                </div>

                {/* Name */}
                <p className={`text-sm font-bold leading-tight mb-1 ${tone.text}`}>{perk.name}</p>

                {/* Description */}
                <p className="text-caption text-gray-400 leading-snug min-h-[40px] mb-2.5 flex-1">{perk.description}</p>

                {/* Cost / status — full-width strip styled by state */}
                <div
                  className={`-mx-3 -mb-3 mt-auto px-3 py-2 border-t flex items-center justify-between ${
                    owned
                      ? 'border-emerald-500/25 bg-emerald-500/[0.10]'
                      : canAfford
                        ? 'border-white/[0.08] bg-black/20'
                        : 'border-red-500/20 bg-red-500/[0.06]'
                  }`}
                >
                  <span className={`text-caption font-mono font-bold tabular-nums inline-flex items-center gap-1 ${
                    owned ? 'text-emerald-400' : canAfford ? 'text-delve' : 'text-gray-400'
                  }`}>
                    <Sparkles className="w-3 h-3" />{perk.cost}
                  </span>
                  <span className={`text-caption font-mono font-bold uppercase tracking-wider ${
                    owned ? 'text-emerald-400' : canAfford ? 'text-white' : 'text-red-400'
                  }`}>
                    {owned ? '✓ owned · refund' : canAfford ? 'TAKE →' : `need +${shortBy}`}
                  </span>
                </div>
              </motion.button>
            )
          })}
        </div>

        {/* Active perks from PRIOR beacons (not in current offers) — refundable chips. */}
        {(() => {
          const offerIds = new Set(offers.map((o) => o.id))
          const priorPerks = run.activePerks.filter((pid) => !offerIds.has(pid))
          if (priorPerks.length === 0) return null
          return (
            <div className="rounded-card border border-white/[0.06] bg-surface-2 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-micro uppercase tracking-wider text-gray-500 font-mono">From earlier beacons</p>
                <p className="text-micro text-gray-600 font-mono">tap × to refund</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {priorPerks.map((pid) => {
                  const found = offers.find((o) => o.id === pid)
                  return (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => refundPerk(pid)}
                      className="text-caption font-mono px-2 py-1 rounded border border-white/15 bg-white/[0.04] text-gray-200 hover:border-red-400/40 hover:bg-red-500/[0.06] hover:text-red-300 inline-flex items-center gap-1.5 transition-colors group"
                      title={found?.description ? `${found.description}\n\nClick to refund.` : 'Click to refund'}
                    >
                      {found?.image
                        ? <img src={found.image} alt="" className="w-5 h-5 object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
                        : <span className="text-base">{found?.icon ?? '✦'}</span>}
                      <span>{found?.name ?? pid}</span>
                      <span className="text-micro text-gray-600 group-hover:text-red-400">×</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* Continue */}
        <div className="space-y-1.5 pt-1">
          <button
            type="button"
            onClick={handleContinue}
            className="w-full py-3 rounded-card font-bold text-sm tracking-wider transition-all active:scale-[0.99] flex items-center justify-center gap-2 group"
            style={{
              background: 'linear-gradient(135deg, rgba(167,139,250,0.30), rgba(167,139,250,0.12))',
              border: '1px solid rgba(167,139,250,0.45)',
              color: '#fff',
              textShadow: '0 0 12px rgba(167,139,250,0.7)',
              boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.06)',
            }}
          >
            <span>CONTINUE TO SECTOR {run.currentFloor + 1}</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
          <p className="text-micro text-center text-gray-600 font-mono">
            no perk needed — drift on
          </p>
        </div>
      </motion.div>
    </div>
  )
}
