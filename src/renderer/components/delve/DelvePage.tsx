import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  useDelveStore, selectActiveRun, selectMaxFloor, selectCosmeticsUnlocked,
  selectBankedFragments, selectMetaUpgradeRanks, selectUnlockedCacheItems,
} from '../../stores/delveStore'
import { fetchWeeklyTop, fetchMyRank, type LeaderboardRow } from '../../services/delveLeaderboardService'
import { getIsoWeek } from '../../stores/delveStore'
import { useAuthStore } from '../../stores/authStore'
import { DelveStakeModal } from './DelveStakeModal'
import { DelveBattleView } from './DelveBattleView'
import { AbyssalCache } from './AbyssalCache'
import { DelveResultModal } from './DelveResultModal'
import { getNextMilestone, DELVE_COSMETICS } from '../../lib/delveCosmetics'
import { META_UPGRADES, getNextRankCost } from '../../lib/delveMetaUpgrades'
import { CACHE_ITEMS } from '../../lib/delveCacheItems'
import { PageHeader } from '../shared/PageHeader'
import { Star, Shield, Sparkles, ChevronRight, Trophy, Skull, Rocket, Crown, Medal, Award, Flame } from '../../lib/icons'
import { AvatarWithFrame } from '../shared/AvatarWithFrame'
import { useNavigationStore } from '../../stores/navigationStore'
import { playClickSound } from '../../lib/sounds'

export function DelvePage() {
  const activeRun = useDelveStore(selectActiveRun)
  const maxFloor = useDelveStore(selectMaxFloor)
  const cosmeticsUnlocked = useDelveStore(selectCosmeticsUnlocked)
  const banked = useDelveStore(selectBankedFragments)
  const metaRanks = useDelveStore(selectMetaUpgradeRanks)
  const unlockedItems = useDelveStore(selectUnlockedCacheItems)
  const user = useAuthStore((s) => s.user)
  const navigateTo = useNavigationStore((s) => s.navigateTo)
  const [mode, setMode] = useState<'casual' | 'hardcore'>('hardcore')
  const pendingResult = useDelveStore((s) => s.pendingResult)
  const acknowledgeResult = useDelveStore((s) => s.acknowledgeResult)
  const [showStake, setShowStake] = useState(false)
  const [showCache, setShowCache] = useState(false)
  const [topHc, setTopHc] = useState<LeaderboardRow[]>([])
  const [myRank, setMyRank] = useState<{ rank: number; floor: number } | null>(null)
  const [lbLoading, setLbLoading] = useState(true)

  const weekIso = useMemo(() => getIsoWeek(), [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!user) { setLbLoading(false); return }
      const [rows, rank] = await Promise.all([
        fetchWeeklyTop(weekIso, 'hardcore', 5),
        fetchMyRank(weekIso, 'hardcore'),
      ])
      if (!cancelled) {
        setTopHc(rows); setMyRank(rank); setLbLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [user, weekIso])

  const nextMilestone = getNextMilestone(maxFloor.hardcore)
  const prevMilestoneFloor = nextMilestone
    ? DELVE_COSMETICS.filter((c) => c.floor < nextMilestone.floor).reduce((m, c) => Math.max(m, c.floor), 0)
    : 0
  const sectorsToNext = nextMilestone ? Math.max(0, nextMilestone.floor - maxFloor.hardcore) : 0
  const milestoneProgressPct = nextMilestone
    ? Math.min(100, Math.max(0, ((maxFloor.hardcore - prevMilestoneFloor) / (nextMilestone.floor - prevMilestoneFloor)) * 100))
    : 0
  const totalMetaRanks = META_UPGRADES.reduce((acc, m) => acc + (metaRanks[m.id] ?? 0), 0)
  const maxMetaRanks = META_UPGRADES.reduce((acc, m) => acc + m.costs.length, 0)

  const affordableUpgrades = META_UPGRADES.reduce((n, def) => {
    const rank = metaRanks[def.id] ?? 0
    const cost = getNextRankCost(def.id, rank)
    return cost !== null && banked >= cost ? n + 1 : n
  }, 0)
  const affordableItems = CACHE_ITEMS.reduce((n, it) => {
    if (unlockedItems.includes(it.id)) return n
    return banked >= it.cost ? n + 1 : n
  }, 0)
  const affordableTotal = affordableUpgrades + affordableItems

  const hasAnyFloor = maxFloor.hardcore > 0 || maxFloor.casual > 0
  // Hide the ladder when YOU is the only entry — a 1-row "leaderboard" of yourself
  // looks like fake-glory, not social context. Show it only when at least one OTHER
  // player has charted a run this week.
  const otherPlayersInTop = topHc.filter((r) => r.userId !== user?.id).length
  const hasLeaderboard = otherPlayersInTop > 0

  if (activeRun) return <DelveBattleView />

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="min-h-full flex flex-col justify-center p-4 pb-20 max-w-md mx-auto space-y-3"
      >
        {/* Header */}
        <PageHeader
          title="Stellar Drift"
          icon={<Star className="w-4 h-4 text-delve" />}
          onBack={() => navigateTo?.('home')}
          rightSlot={<ShardsChip value={banked} />}
        />

        {/* Personal best — context for mode choice. Hidden until first run. */}
        {hasAnyFloor && (
          <div className="rounded border border-white/[0.06] bg-surface-2 grid grid-cols-2 divide-x divide-white/[0.06]">
            <div className="px-3 py-2">
              <div className="flex items-center gap-1 mb-0.5">
                <Skull className="w-3 h-3 text-red-400/70" />
                <p className="text-micro uppercase tracking-wider text-gray-500 font-mono">Deepest HC</p>
              </div>
              <p className="font-mono text-base font-bold tabular-nums text-red-400">
                sector <span className="text-red-300">{maxFloor.hardcore}</span>
              </p>
            </div>
            <div className="px-3 py-2">
              <div className="flex items-center gap-1 mb-0.5">
                <Shield className="w-3 h-3 text-gray-500" />
                <p className="text-micro uppercase tracking-wider text-gray-500 font-mono">Practice</p>
              </div>
              <p className="font-mono text-base font-bold tabular-nums text-gray-300">
                sector <span className="text-white">{maxFloor.casual}</span>
              </p>
            </div>
          </div>
        )}

        {/* Mode picker — sits above LAUNCH so the choice is current. */}
        <div className="grid grid-cols-2 gap-2">
          <ModeButton
            active={mode === 'casual'}
            onClick={() => { playClickSound(); setMode('casual') }}
            accent="accent"
            icon={<Shield className="w-3.5 h-3.5" />}
            label="Practice"
            meta="gear safe · 1× shards"
          />
          <ModeButton
            active={mode === 'hardcore'}
            onClick={() => { playClickSound(); setMode('hardcore') }}
            accent="red"
            icon={<Skull className="w-3.5 h-3.5" />}
            label="Hardcore"
            meta="gear at risk · 1.5× shards"
          />
        </div>

        {/* Primary action — sits in the upper-half, where the eye lands */}
        <StartButton mode={mode} onClick={() => { playClickSound(); setShowStake(true) }} />

        {/* Shop — secondary action, below the launch fold */}
        <button
          type="button"
          onClick={() => { playClickSound(); setShowCache(true) }}
          className="w-full rounded border border-white/[0.06] bg-surface-2 hover:border-delve/30 active:scale-[0.99] transition-all p-3 flex items-center gap-3 text-left"
        >
          <div className="w-9 h-9 rounded border border-delve/30 bg-delve/[0.08] flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-delve" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <p className="text-caption font-bold text-white">Stellar Cache</p>
              {affordableTotal > 0 && (
                <span className="text-micro font-mono px-1.5 py-px rounded bg-delve/12 border border-delve/25 text-delve">
                  {affordableTotal} ready
                </span>
              )}
            </div>
            <p className="text-micro text-gray-400 font-mono tabular-nums">
              {totalMetaRanks}/{maxMetaRanks} upgrades · {unlockedItems.length}/{CACHE_ITEMS.length} items
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-500" />
        </button>

        {/* Reference info — only render if there's something to show */}
        {(hasLeaderboard || lbLoading) && (
          <section className="rounded-card border border-white/[0.06] bg-surface-2 overflow-hidden">
            <div className="px-3 py-2 flex items-center justify-between border-b border-white/[0.06]">
              <div className="flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-amber-400/70" />
                <p className="text-caption font-semibold text-white">Weekly Ladder</p>
              </div>
              <span className="text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/25 text-red-400/80">hardcore</span>
            </div>
            <div className="p-2">
              {lbLoading ? (
                <p className="py-3 text-center text-micro text-gray-600 font-mono animate-pulse">loading…</p>
              ) : (
                <div className="space-y-1">
                  {topHc.map((row) => (
                    <LeaderboardRowView key={row.runId} row={row} isMe={row.userId === user?.id} />
                  ))}
                  {myRank && !topHc.find((r) => r.userId === user?.id) && (
                    <>
                      {topHc.length > 0 && (
                        <p className="text-center py-0.5 text-micro text-gray-700 font-mono select-none">· · ·</p>
                      )}
                      <LeaderboardRowView
                        row={{ rank: myRank.rank, userId: user?.id ?? '', displayName: 'YOU', floor: myRank.floor, runId: 'self', endedAt: '' }}
                        isMe
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Skins + next-skin progress — single compact card; hides until first run gives context */}
        {hasAnyFloor && (
          <div className="rounded border border-white/[0.06] bg-surface-2 px-3 py-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400/80" />
                <p className="text-caption font-semibold text-white">Stellar Skins</p>
              </div>
              <p className="text-micro font-mono tabular-nums text-gray-400">
                <span className="text-amber-400 font-bold">{cosmeticsUnlocked.length}</span>
                <span className="text-gray-600"> / {DELVE_COSMETICS.length}</span>
              </p>
            </div>
            {nextMilestone ? (
              <>
                <div className="flex items-center justify-between text-micro font-mono">
                  <span className="text-gray-300 truncate pr-2">
                    Next: <span className="text-amber-400">{nextMilestone.name}</span>
                  </span>
                  <span className="text-amber-400/80 tabular-nums shrink-0">+{sectorsToNext} sectors</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500/60 to-amber-400/80 rounded-full transition-all"
                    style={{ width: `${milestoneProgressPct}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-micro text-gray-500 font-mono">All skins unlocked. You hold the deep.</p>
            )}
          </div>
        )}

        {showStake && <DelveStakeModal mode={mode} onClose={() => setShowStake(false)} onStarted={() => setShowStake(false)} />}
        {showCache && <AbyssalCache onClose={() => setShowCache(false)} />}
        {pendingResult && <DelveResultModal result={pendingResult} onClose={acknowledgeResult} />}
      </motion.div>
    </>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

/** Currency chip — same shape/density as GoldDisplay. */
function ShardsChip({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-delve/12 border border-delve/25">
      <Sparkles className="w-3.5 h-3.5 text-delve" />
      <span className="text-sm font-bold text-delve tabular-nums">{value}</span>
      <span className="text-micro text-delve/70 font-mono uppercase tracking-wider">shards</span>
    </div>
  )
}

function ModeButton({ active, onClick, accent, icon, label, meta }: {
  active: boolean
  onClick: () => void
  accent: 'accent' | 'red'
  icon: React.ReactNode
  label: string
  meta: string
}) {
  const styles = active
    ? accent === 'red'
      ? 'border-red-500/40 bg-red-500/15 ring-1 ring-inset ring-red-500/25'
      : 'border-accent/40 bg-accent/15 ring-1 ring-inset ring-accent/25'
    : 'border-white/[0.06] bg-surface-2 hover:border-white/15'
  const labelColor = active
    ? accent === 'red' ? 'text-red-300' : 'text-accent'
    : 'text-gray-300'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border p-2.5 text-left transition-colors ${styles}`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className={labelColor}>{icon}</span>
        <p className={`text-caption font-bold ${labelColor}`}>{label}</p>
      </div>
      <p className="text-micro text-gray-500 font-mono leading-tight">{meta}</p>
    </button>
  )
}

/** Launch CTA — Arena Enter-style: subtle 30/18 gradient, thin border, textShadow on text. */
function StartButton({ mode, onClick }: { mode: 'casual' | 'hardcore'; onClick: () => void }) {
  const tc = mode === 'hardcore' ? '#ef4444' : '#5865F2'
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full py-3 rounded text-sm font-bold tracking-wider transition-all active:scale-[0.98] flex items-center justify-center gap-2 group"
      style={{
        background: `linear-gradient(135deg, ${tc}30, ${tc}18)`,
        border: `1px solid ${tc}60`,
        color: '#fff',
        textShadow: `0 0 12px ${tc}`,
      }}
    >
      <Rocket className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
      <span>LAUNCH RUN</span>
    </button>
  )
}

/** Row matches Social Leaderboard shape 1:1 — avatar + frame, name + guild tag, streak, big score. */
function LeaderboardRowView({ row, isMe }: { row: LeaderboardRow; isMe: boolean }) {
  return (
    <div
      className={`flex items-center gap-2.5 py-2 px-3 rounded transition-colors ${
        isMe ? 'bg-accent/5 border border-accent/20' : 'hover:bg-white/[0.04]'
      }`}
    >
      <span className="w-6 shrink-0 flex items-center justify-center">
        <RankBadge rank={row.rank} />
      </span>
      <div className="overflow-visible shrink-0">
        <AvatarWithFrame
          avatar={row.avatarUrl || '🤖'}
          frameId={row.equippedFrame}
          sizeClass="w-8 h-8"
          textClass="text-sm"
          roundedClass="rounded-full"
          ringInsetClass="-inset-0.5"
          ringOpacity={0.95}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-semibold truncate ${isMe ? 'text-accent' : 'text-white'}`}>
            {row.displayName}
            {isMe && <span className="text-gray-500 ml-1">(you)</span>}
          </span>
          {row.guildTag && (
            <span
              className="text-micro px-1 py-[1px] rounded font-bold border border-amber-500/40 bg-amber-500/10 text-amber-400 shrink-0"
              title={`Guild: ${row.guildTag}`}
            >
              [{row.guildTag}]
            </span>
          )}
        </div>
        {row.streakCount && row.streakCount > 0 ? (
          <span className="text-micro text-orange-400/70 font-mono inline-flex items-center gap-0.5">
            <Flame className="w-2.5 h-2.5" />
            {row.streakCount}d streak
          </span>
        ) : (
          <span className="text-micro text-gray-600 font-mono">sector reached</span>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-xs font-mono font-bold ${isMe ? 'text-accent' : row.rank === 1 ? 'text-amber-400' : 'text-red-400'}`}>
          {row.floor}
        </p>
        <p className="text-micro text-gray-600 font-mono uppercase tracking-wider">sector</p>
      </div>
    </div>
  )
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="w-4 h-4 text-amber-400" aria-label="1st" />
  if (rank === 2) return <Medal className="w-4 h-4 text-gray-300" aria-label="2nd" />
  if (rank === 3) return <Award className="w-4 h-4 text-orange-500" aria-label="3rd" />
  return (
    <span className="font-mono text-micro text-gray-500 tabular-nums">
      #{rank}
    </span>
  )
}
