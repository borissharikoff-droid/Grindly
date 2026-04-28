import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion'
import { useDelveStore, selectActiveRun, EXTRACT_TAX_PCT, resolveActivePerkDefs } from '../../stores/delveStore'
import {
  playDelveHitSound, playDelveMobDeathSound, playDelvePlayerHitSound, playDelveBossDownSound,
} from '../../lib/sounds'
import { getCurrentCombatMode } from '../../lib/delveCombat'
import { effectiveBossDps, effectivePlayerDps } from '../../lib/combat'
import { resolveItemDisplay } from '../../lib/itemLookup'
import { LootVisual } from '../loot/LootUI'
import { getRunInventoryCap } from '../../lib/delveMetaUpgrades'
import { RARITY_THEME } from '../loot/LootUI'
import { aggregateRunMultipliers } from '../../lib/delvePerks'
import { RubiconFloorView } from './RubiconFloorView'
import { DelveMap } from './DelveMap'
import { DelveSafeSpotPanel } from './DelveSafeSpotPanel'
import { Heart, Sword, Shield, Star, Skull, Coins, Sparkles } from '../../lib/icons'
import { fmt } from '../../lib/format'
import { DELVE_CYCLE_LENGTH } from '../../lib/delveGen'
import { FOOD_ITEM_MAP } from '../../lib/cooking'
import type { MobDef, FoodLoadoutSlot } from '../../lib/combat'

export function DelveBattleView() {
  const run = useDelveStore(selectActiveRun)
  const forfeitRun = useDelveStore((s) => s.forfeitRun)
  const extractRun = useDelveStore((s) => s.extractRun)
  const metaRanks = useDelveStore((s) => s.metaUpgradeRanks)
  const [confirmForfeit, setConfirmForfeit] = useState(false)
  const [showMap, setShowMap] = useState(false)

  // Battle tick is mounted globally in App.tsx — runs even when this view is unmounted.
  const battleState = useDelveStore((s) => s.getBattleState)()

  const maxHp = run?.playerSnapshot.hp ?? 1
  // Clamp display HP to max — food can heal sim HP above the snapshot cap (acts as
  // temp shield during combat), but showing "420/335" is confusing. The buffer above
  // max gets eaten silently before the visible bar starts dropping.
  const rawHp = battleState?.playerHp ?? run?.playerHp ?? 0
  const displayHp = Math.min(rawHp, maxHp)

  // Floating damage numbers on player + each mob (crit = big single hit, gets bigger font)
  const [playerDmg, setPlayerDmg] = useState<Array<{ id: string; v: number; crit: boolean }>>([])
  const [mobDmg, setMobDmg] = useState<Record<number, Array<{ id: string; v: number; crit: boolean }>>>({})
  // Mob death "kill nonce" — increments each time mob i dies, drives particle burst
  const [mobKillNonce, setMobKillNonce] = useState<Record<number, number>>({})
  const prevHpRef = useRef<number | null>(null)
  const prevMobHpRef = useRef<number[] | null>(null)

  // Screen-shake on big player hits — useAnimationControls lets us trigger imperatively
  // without remounting the wrapper.
  const shakeControls = useAnimationControls()
  function triggerShake(intensity: 'small' | 'big' = 'small') {
    const amp = intensity === 'big' ? 8 : 4
    void shakeControls.start({
      x: [0, -amp, amp, -amp * 0.7, amp * 0.7, -amp * 0.4, amp * 0.4, 0],
      transition: { duration: 0.35, ease: 'easeOut' },
    })
  }

  // Detect boss-floor for sound routing in the dmg effect below
  const isBossFloor = run?.currentFloorSpec?.kind === 'boss'

  useEffect(() => {
    if (!battleState || battleState.isComplete) {
      prevHpRef.current = null
      prevMobHpRef.current = null
      return
    }
    // Player damage
    const prevHp = prevHpRef.current
    if (prevHp !== null && battleState.playerHp < prevHp) {
      const dmg = Math.round(prevHp - battleState.playerHp)
      if (dmg > 0) {
        const isCrit = dmg >= maxHp * 0.18
        const id = crypto.randomUUID()
        setPlayerDmg((ns) => [...ns.slice(-3), { id, v: dmg, crit: isCrit }])
        setTimeout(() => setPlayerDmg((ns) => ns.filter((n) => n.id !== id)), 700)
        if (isCrit) {
          triggerShake('big')
          playDelvePlayerHitSound()
        } else if (dmg >= maxHp * 0.06) {
          triggerShake('small')
        }
      }
    }
    prevHpRef.current = battleState.playerHp

    // Mob damage + death detection
    const prevMobs = prevMobHpRef.current
    if (prevMobs && battleState.mobHps) {
      for (let i = 0; i < battleState.mobHps.length; i++) {
        const prev = prevMobs[i]
        const curr = battleState.mobHps[i]
        if (prev != null && curr < prev) {
          const dmg = Math.round(prev - curr)
          if (dmg > 0) {
            const isCrit = dmg >= prev * 0.35
            const id = crypto.randomUUID()
            setMobDmg((m) => ({ ...m, [i]: [...(m[i] ?? []).slice(-2), { id, v: dmg, crit: isCrit }] }))
            setTimeout(() => setMobDmg((m) => ({ ...m, [i]: (m[i] ?? []).filter((n) => n.id !== id) })), 700)
            // Soft hit feedback only on first non-tiny hit per second to avoid sound spam
            if (dmg >= prev * 0.05) playDelveHitSound()
          }
          // Mob just died on this tick — fire particles + death sound
          if (prev > 0 && curr <= 0) {
            setMobKillNonce((s) => ({ ...s, [i]: (s[i] ?? 0) + 1 }))
            if (isBossFloor) playDelveBossDownSound()
            else playDelveMobDeathSound()
          }
        }
      }
    }
    prevMobHpRef.current = battleState.mobHps?.slice() ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleState])

  if (!run) return null

  if (run.currentFloorSpec?.kind === 'rubicon') {
    return <RubiconFloorView />
  }

  const spec = run.currentFloorSpec
  const isRest = spec?.kind === 'rest'
  const isBoss = spec?.kind === 'boss'
  const combatMode = getCurrentCombatMode(run.foodLoadout)

  const runLoot = run.runInventory
  const runCap = getRunInventoryCap(metaRanks)

  const activePerkDefs = resolveActivePerkDefs(run.activePerks)
  const mults = aggregateRunMultipliers(run.activePerks)

  const displayMobs: MobDef[] = isBoss && spec.boss ? [bossAsMob(spec.boss)] : (spec?.mobs ?? [])
  const mobHps = battleState?.mobHps ?? displayMobs.map((m) => m.hp)
  const aliveCount = mobHps.filter((hp) => hp > 0).length

  const playerAtk = run.playerSnapshot.atk
  const playerDef = run.playerSnapshot.def
  const playerRegen = run.playerSnapshot.hpRegen
  const perMobAtk = combatMode === 'cleave' && aliveCount > 0 ? playerAtk / aliveCount : playerAtk
  let totalIncomingDps = 0
  for (let i = 0; i < displayMobs.length; i++) {
    if (mobHps[i] <= 0) continue
    totalIncomingDps += effectiveBossDps(displayMobs[i].atk, playerRegen, playerDef)
  }
  const totalOutgoingDps = displayMobs.reduce((sum, m, i) => {
    if (mobHps[i] <= 0) return sum
    return sum + effectivePlayerDps(perMobAtk, m.def ?? 0)
  }, 0)
  const netDps = totalOutgoingDps - totalIncomingDps

  const playerHpPct = Math.max(0, Math.min(100, (displayHp / maxHp) * 100))
  const playerDanger = playerHpPct < 30

  const activeFood = run.foodLoadout.filter((s): s is FoodLoadoutSlot => !!s && s.qty > 0)
  // Equipped loadout — shown in player block so HC players see what they're risking
  // and any player can recall their build at a glance during the fight.
  const equippedEntries = Object.entries(run.stakedManifest.equipped)
    .filter(([, id]) => !!id) as Array<[string, string]>

  function handleExtract() {
    // Result lands in store.pendingResult. By the time React re-renders, `run` will be null
    // and DelvePage will pick up the result and render <DelveResultModal />.
    extractRun()
  }

  return (
    <>
      <motion.div
        animate={shakeControls}
        className="min-h-screen flex flex-col justify-center p-3 pt-4 pb-20 max-w-md mx-auto space-y-2.5"
      >
        {/* ── Top header ─────────────────────────────────────── */}
        <div className="rounded-card border border-white/[0.06] bg-surface-2 px-3 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <p className="font-display text-base font-semibold text-white tracking-wide leading-none">
                Sector <span className="font-mono">{run.currentFloor}</span>
                <span className="text-micro text-gray-500 font-mono ml-0.5">cycle {Math.floor((run.currentFloor - 1) / DELVE_CYCLE_LENGTH) + 1}</span>
              </p>
              <span className={`text-micro font-bold font-mono px-1.5 py-0.5 rounded leading-none ${
                run.mode === 'hardcore'
                  ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                  : 'bg-accent/15 text-accent border border-accent/30'
              }`}>
                {run.mode === 'hardcore' ? 'HC' : 'PRACTICE'}
              </span>
              {spec?.mutator && (
                <span
                  className="text-micro font-bold font-mono px-1.5 py-0.5 rounded leading-none bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  title={spec.mutator.description}
                >
                  ⚡ {spec.mutator.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowMap(true)}
                title="Open star map"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 hover:text-white text-micro font-mono leading-none transition-colors"
              >
                <Star className="w-3 h-3" />
                MAP
              </button>
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-delve/40 bg-delve-muted leading-none">
                <span className="text-delve">✦</span>
                <motion.span
                  key={`frag-${run.runFragments}`}
                  initial={{ scale: 1.5 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                  className="font-mono text-caption font-bold text-delve tabular-nums inline-block"
                >
                  {run.runFragments}
                </motion.span>
              </div>
            </div>
          </div>
          {/* Cycle progress — fills toward the next boss every 10 sectors */}
          <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
            <div
              className="h-full bg-delve transition-all"
              style={{ width: `${((((run.currentFloor - 1) % DELVE_CYCLE_LENGTH) + 1) / DELVE_CYCLE_LENGTH) * 100}%` }}
            />
          </div>
        </div>

        {/* ── Active perks ribbon (if any) ────────────────────── */}
        {activePerkDefs.length > 0 && (
          <div className="flex flex-wrap gap-1 justify-center">
            {activePerkDefs.map((p) => {
              const tone = p.rarity === 'epic' ? 'text-purple-300 border-purple-400/40 bg-purple-500/10'
                         : p.rarity === 'rare' ? 'text-sky-300 border-sky-400/40 bg-sky-500/10'
                         : 'text-gray-300 border-white/15 bg-white/[0.04]'
              return (
                <span
                  key={p.id}
                  title={p.description}
                  className={`text-micro font-mono font-semibold px-1.5 py-0.5 rounded border flex items-center gap-1 ${tone}`}
                >
                  <span>{p.icon}</span><span>{p.name}</span>
                </span>
              )
            })}
          </div>
        )}

        {/* ── Floor body ─────────────────────────────────────── */}
        {isRest ? (
          <DelveSafeSpotPanel />
        ) : isBoss && displayMobs[0] ? (
          <BossCard
            boss={displayMobs[0]}
            hp={mobHps[0] ?? displayMobs[0].hp}
            outgoingDps={effectivePlayerDps(perMobAtk, displayMobs[0].def ?? 0)}
            incomingDps={effectiveBossDps(displayMobs[0].atk, playerRegen, playerDef)}
            dmgNumbers={mobDmg[0] ?? []}
            killNonce={mobKillNonce[0] ?? 0}
          />
        ) : (
          <div className={`grid gap-2 ${displayMobs.length === 1 ? 'grid-cols-1' : displayMobs.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            <AnimatePresence>
              {displayMobs.map((mob, i) => (
                <MobCard
                  key={`${mob.id}-${i}`}
                  mob={mob}
                  hp={mobHps[i] ?? mob.hp}
                  isFocused={battleState?.focusTargetIndex === i}
                  outgoingDps={effectivePlayerDps(perMobAtk, mob.def ?? 0)}
                  incomingDps={effectiveBossDps(mob.atk, playerRegen, playerDef)}
                  dmgNumbers={mobDmg[i] ?? []}
                  killNonce={mobKillNonce[i] ?? 0}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* ── Player block ───────────────────────────────────── */}
        <motion.div
          animate={playerDanger
            ? {
                boxShadow: [
                  '0 0 0 1px rgba(239,68,68,0.0), 0 0 12px -4px rgba(239,68,68,0.0)',
                  '0 0 0 1px rgba(239,68,68,0.55), 0 0 22px -4px rgba(239,68,68,0.45)',
                  '0 0 0 1px rgba(239,68,68,0.0), 0 0 12px -4px rgba(239,68,68,0.0)',
                ],
              }
            : { boxShadow: '0 0 0 0 rgba(0,0,0,0)' }
          }
          transition={playerDanger ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
          className={`rounded-card border bg-surface-2 px-3 py-2.5 ${playerDanger ? 'border-red-500/40' : 'border-white/[0.06]'}`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <p className={`text-caption font-semibold ${playerDanger ? 'text-red-300' : 'text-emerald-300'}`}>
                You {playerDanger && <span>⚠</span>}
              </p>
              <div className="flex items-center gap-2 text-micro font-mono">
                <span className="flex items-center gap-0.5 text-orange-300" title="Attack"><Sword className="w-3 h-3" /><span className="font-bold tabular-nums">{Math.round(playerAtk)}</span></span>
                <span className="flex items-center gap-0.5 text-indigo-300" title="Defense"><Shield className="w-3 h-3" /><span className="font-bold tabular-nums">{playerDef}</span></span>
                <span className="flex items-center gap-0.5 text-emerald-400/80" title="Regen/sec"><Heart className="w-3 h-3" /><span className="font-bold tabular-nums">+{playerRegen}</span></span>
              </div>
            </div>
            <span className="text-caption font-mono text-gray-400 tabular-nums">
              <span className={playerDanger ? 'text-red-400 font-bold' : 'text-white'}>{Math.ceil(displayHp)}</span>
              <span className="text-gray-600"> / {Math.ceil(maxHp)}</span>
            </span>
          </div>
          <div className="relative">
            <div className="h-3 rounded-full overflow-hidden bg-black/40 shadow-inner">
              <motion.div
                animate={{ width: `${playerHpPct}%`, opacity: playerDanger ? [1, 0.7, 1] : 1 }}
                transition={{
                  width: { duration: 0.3 },
                  opacity: playerDanger ? { duration: 1.1, repeat: Infinity } : { duration: 0 },
                }}
                className={`h-full ${playerDanger ? 'bg-gradient-to-r from-red-700 to-red-500' : 'bg-gradient-to-r from-emerald-600 to-emerald-400'}`}
              />
            </div>
            <AnimatePresence>
              {playerDmg.map((d, idx) => (
                <motion.span
                  key={d.id}
                  // Start above header row so big dmg digits don't overlap "330/335" HP text.
                  initial={{ opacity: 1, y: -24, scale: 1.3 }}
                  animate={{ opacity: 0, y: -56, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.85, ease: 'easeOut' }}
                  className="absolute -top-2 pointer-events-none font-mono font-black tabular-nums"
                  style={{
                    right: `${6 + idx * 38}px`,
                    color: '#f87171',
                    fontSize: '22px',
                    textShadow: '0 2px 6px rgba(0,0,0,0.95), 0 0 12px rgba(248,113,113,0.5)',
                  }}
                >
                  −{d.v}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>

          {/* Loadout — gear (left) + food (right). Single row when both exist. */}
          {(equippedEntries.length > 0 || activeFood.length > 0) && (
            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-white/[0.04] flex-wrap">
              {equippedEntries.length > 0 && (
                <div className="flex items-center gap-1 min-w-0">
                  <span
                    className={`text-micro font-mono uppercase tracking-wider mr-0.5 ${
                      run.mode === 'hardcore' ? 'text-red-400/70' : 'text-gray-500'
                    }`}
                    title={run.mode === 'hardcore' ? 'Lost on death' : 'Safe in Practice'}
                  >
                    {run.mode === 'hardcore' ? 'risk' : 'gear'}
                  </span>
                  {equippedEntries.map(([slot, id]) => {
                    const display = resolveItemDisplay(id)
                    return (
                      <div
                        key={slot}
                        title={display.name}
                        className={`w-6 h-6 rounded border flex items-center justify-center shrink-0 ${
                          run.mode === 'hardcore' ? 'border-red-500/25 bg-red-500/[0.05]' : 'border-white/10 bg-black/20'
                        }`}
                      >
                        <LootVisual icon={display.icon} image={display.image} className="w-5 h-5 object-contain" scale={1} />
                      </div>
                    )
                  })}
                </div>
              )}
              {activeFood.length > 0 && (
                <div className="flex items-center gap-1 ml-auto">
                  <span className="text-micro font-mono uppercase tracking-wider text-orange-400/60 mr-0.5">food</span>
                  {activeFood.map((s) => {
                    const food = FOOD_ITEM_MAP[s.foodId]
                    return (
                      <div
                        key={s.foodId}
                        title={food ? `${food.name} ×${s.qty}` : s.foodId}
                        className="relative w-6 h-6 rounded border border-orange-400/25 bg-orange-400/[0.05] flex items-center justify-center shrink-0"
                      >
                        {food?.image
                          ? <LootVisual icon={food.icon} image={food.image} className="w-5 h-5 object-contain" scale={1} />
                          : <span className="text-xs">{food?.icon ?? '🍳'}</span>}
                        <motion.span
                          key={`qty-${s.qty}`}
                          initial={{ scale: 1.6, color: '#fbbf24' }}
                          animate={{ scale: 1, color: '#ffffff' }}
                          transition={{ duration: 0.45 }}
                          className="absolute -bottom-1 -right-1 text-[9px] font-mono font-bold bg-black/70 rounded px-0.5 leading-none tabular-nums"
                        >
                          {s.qty}
                        </motion.span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </motion.div>

        {/* ── Tug-of-war combat summary ──────────────────────── */}
        {!isRest && aliveCount > 0 && (() => {
          const totalDps = totalOutgoingDps + totalIncomingDps
          const outPct = totalDps > 0 ? (totalOutgoingDps / totalDps) * 100 : 50
          const winning = netDps >= 0
          const hasMults = mults.fragmentsMult > 1 || mults.goldMult > 1
          return (
            <div className="rounded border border-white/[0.06] bg-surface-2 px-3 py-2">
              <div className="flex items-center justify-between text-micro font-mono mb-1.5">
                <span className="flex items-center gap-1 text-emerald-400">
                  <span>⚔</span>
                  <span className="font-bold tabular-nums">+{totalOutgoingDps.toFixed(1)}</span>
                </span>
                <span className="flex items-center gap-1 text-red-400">
                  <span className="font-bold tabular-nums">−{totalIncomingDps.toFixed(1)}</span>
                  <span>♥</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface-3 overflow-hidden flex">
                <motion.div
                  animate={{ width: `${outPct}%` }}
                  transition={{ duration: 0.4 }}
                  className="h-full bg-gradient-to-r from-emerald-700 to-emerald-400"
                />
                <motion.div
                  animate={{ width: `${100 - outPct}%` }}
                  transition={{ duration: 0.4 }}
                  className="h-full bg-gradient-to-r from-red-400 to-red-700"
                />
              </div>
              <div className="flex items-center justify-between mt-1.5 text-micro font-mono">
                <p className={`uppercase font-bold tracking-wider ${winning ? 'text-emerald-400' : 'text-red-400'}`}>
                  {winning ? 'winning' : 'losing'} by {winning ? '+' : ''}{netDps.toFixed(1)}/s
                </p>
                <span className="text-gray-600">
                  {combatMode === 'cleave' && aliveCount > 1 ? `cleave ÷${aliveCount}` : combatMode}
                  {hasMults && (
                    <span className="ml-1.5 text-delve inline-flex items-center gap-1">
                      {mults.fragmentsMult > 1 && (
                        <span className="inline-flex items-center gap-0.5">
                          <Sparkles className="w-3 h-3" />×{mults.fragmentsMult.toFixed(1)}
                        </span>
                      )}
                      {mults.goldMult > 1 && (
                        <span className="inline-flex items-center gap-0.5 text-amber-400">
                          <Coins className="w-3 h-3" />×{mults.goldMult.toFixed(1)}
                        </span>
                      )}
                    </span>
                  )}
                </span>
              </div>
            </div>
          )
        })()}

        {/* ── Run loot + Extract ─────────────────────────────── */}
        <div className="rounded-card border border-white/[0.06] bg-surface-2 p-2">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-micro uppercase tracking-wider text-gray-500 font-mono">Loot</p>
            <p className="text-micro font-mono text-gray-500">{runLoot.length}/{runCap}</p>
          </div>
          {(() => {
            // Aggregate: sum gold drops into one chip, keep non-gold items individual.
            let goldTotal = 0
            const items: Array<{ key: string; loot: { kind: string; id: string; qty: number } }> = []
            for (let i = 0; i < runLoot.length; i++) {
              const l = runLoot[i]
              if (l.kind === 'gold') goldTotal += l.qty
              else items.push({ key: `${i}-${l.kind}-${l.id}`, loot: l })
            }
            const visibleItems = items.slice(-10)
            const hiddenItems = items.length - visibleItems.length
            const hasAnything = goldTotal > 0 || items.length > 0 || run.runFragments > 0
            if (!hasAnything) {
              return <p className="text-caption text-gray-600 font-mono py-1">empty — push deeper</p>
            }
            return (
              <div className="flex flex-wrap gap-1">
                {/* Shards earned this run — always first when > 0 */}
                {run.runFragments > 0 && (
                  <motion.span
                    key={`shard-${run.runFragments}`}
                    initial={{ scale: 1.15 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                    className="px-1.5 py-0.5 rounded-full border border-delve/40 bg-delve-muted text-micro font-mono text-delve tabular-nums inline-flex items-center gap-0.5"
                    title="Shards collected this run"
                  >
                    <Sparkles className="w-3 h-3" />+{run.runFragments}
                  </motion.span>
                )}
                {/* Gold stack — single chip with run total */}
                {goldTotal > 0 && (
                  <motion.span
                    key={`gold-${goldTotal}`}
                    initial={{ scale: 1.15 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                    className="px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-micro font-mono text-amber-400 tabular-nums inline-flex items-center gap-0.5"
                    title="Gold collected this run"
                  >
                    <Coins className="w-3 h-3" />+{fmt(goldTotal)}
                  </motion.span>
                )}
                {/* Item drops — newest last */}
                <AnimatePresence initial={false}>
                  {visibleItems.map(({ key, loot }) => (
                    <RunLootChip key={key} loot={loot} />
                  ))}
                </AnimatePresence>
                {hiddenItems > 0 && (
                  <span className="text-micro font-mono text-gray-500 self-center">+{hiddenItems}</span>
                )}
              </div>
            )
          })()}
        </div>

        <button
          type="button"
          onClick={handleExtract}
          className="w-full py-2.5 rounded-card border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-bold transition-colors flex items-center justify-center gap-2"
          title={!isRest && run.currentFloor > 1 ? `Leave now — keep loot, lose ${EXTRACT_TAX_PCT}% gold` : 'Leave safely'}
        >
          <span className="text-caption">RETURN TO BASE</span>
          <span className="text-micro font-normal opacity-75">
            {!isRest && run.currentFloor > 1 ? `−${EXTRACT_TAX_PCT}% gold` : 'no penalty'}
          </span>
        </button>

        <div className="text-center pt-1">
          <button
            type="button"
            onClick={() => setConfirmForfeit(true)}
            className="text-micro font-mono text-gray-600 hover:text-red-400 transition-colors underline-offset-2 hover:underline"
          >
            abort mission
          </button>
        </div>
      </motion.div>

      {/* Forfeit confirm */}
      {confirmForfeit && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-surface-2 rounded-card border border-white/[0.06] p-4 max-w-sm shadow-modal"
          >
            <p className="text-body font-bold text-white mb-1">Abort the mission?</p>
            <p className="text-caption text-gray-400 mb-4">
              {run.mode === 'hardcore'
                ? 'Hardcore — your equipped gear will be lost permanently.'
                : 'Practice — loot lost but gear is safe.'}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmForfeit(false)}
                className="px-3 py-1.5 rounded border border-white/10 text-gray-300 text-caption hover:bg-white/[0.04]"
              >
                Keep flying
              </button>
              <button
                type="button"
                onClick={() => { forfeitRun(); setConfirmForfeit(false) }}
                className="px-3 py-1.5 rounded border border-red-500/40 bg-red-500/15 text-red-300 text-caption font-bold hover:bg-red-500/25"
              >
                Abort
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {showMap && <DelveMap onClose={() => setShowMap(false)} />}
    </>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

/** Particle burst — N small dots radiating outward from center, used on mob death.
 *  Mounted with a key={killNonce} so it remounts (and replays) each time the mob dies. */
function DeathParticles({ color, count, radius }: { color: string; count: number; radius: number }) {
  const particles = useRef(
    Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4
      const dist = radius * (0.6 + Math.random() * 0.5)
      return {
        id: i,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        size: 4 + Math.random() * 4,
      }
    }),
  ).current
  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 0.3 }}
          transition={{ duration: 0.55 + Math.random() * 0.2, ease: 'easeOut' }}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            background: color,
            boxShadow: `0 0 6px ${color}`,
          }}
        />
      ))}
    </div>
  )
}

function BossCard({ boss, hp, outgoingDps, incomingDps, dmgNumbers, killNonce }: {
  boss: MobDef
  hp: number
  outgoingDps: number
  incomingDps: number
  dmgNumbers: Array<{ id: string; v: number; crit: boolean }>
  killNonce: number
}) {
  const dead = hp <= 0
  const hpPct = Math.max(0, Math.min(100, (hp / boss.hp) * 100))
  const executeMode = !dead && hpPct < 15  // Boss in finisher range — visual escalation
  // Hit-flash: brief white scale-pulse when fresh dmg arrives
  const hitFlash = !dead && dmgNumbers.length > 0 ? dmgNumbers[dmgNumbers.length - 1].id : null
  return (
    <motion.div
      animate={{
        opacity: dead ? 0.3 : 1,
        scale: dead ? 0.96 : 1,
        boxShadow: executeMode
          ? '0 0 36px -4px rgba(239,68,68,0.85)'
          : '0 0 24px -6px rgba(239,68,68,0.45)',
      }}
      transition={{ duration: 0.3 }}
      className={`relative rounded-card border bg-gradient-to-b from-red-500/[0.08] to-surface-2 p-4 ${
        executeMode ? 'border-red-400 ring-2 ring-inset ring-red-500/30' : 'border-red-500/50'
      }`}
    >
      {/* Particle burst on death */}
      {killNonce > 0 && <DeathParticles key={killNonce} color="#fbbf24" count={20} radius={70} />}
      {/* Hit flash overlay */}
      <AnimatePresence>
        {hitFlash && (
          <motion.div
            key={hitFlash}
            initial={{ opacity: 0.55 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 rounded-card pointer-events-none bg-white"
          />
        )}
      </AnimatePresence>
      <div className="flex items-center justify-between mb-2">
        <span className="text-micro font-mono uppercase tracking-widest text-amber-400/70">Boss</span>
        <span className="text-micro font-mono text-gray-500 tabular-nums">{Math.round(hpPct)}%</span>
      </div>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-16 h-16 rounded-card border border-red-500/40 bg-black/30 flex items-center justify-center shrink-0"
          style={{ filter: 'drop-shadow(0 0 10px rgba(239,68,68,0.45))' }}
        >
          {boss.image
            ? <img src={boss.image} alt="" className="w-12 h-12 object-contain" style={{ imageRendering: 'pixelated' }} />
            : boss.icon
              ? <span className={`text-4xl ${dead ? 'line-through grayscale' : ''}`}>{boss.icon}</span>
              : <Skull className={`w-10 h-10 text-red-300 ${dead ? 'grayscale opacity-50' : ''}`} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-body font-bold ${dead ? 'text-gray-600 line-through' : 'text-red-200'} truncate`}>{boss.name}</p>
          <p className="text-micro font-mono text-gray-500">
            ATK {Math.round(boss.atk)}{(boss.def ?? 0) > 0 && ` · DEF ${boss.def}`}
          </p>
        </div>
      </div>
      <div className="relative mb-1.5">
        <div className="h-3 rounded-full overflow-hidden bg-black/40 shadow-inner">
          <motion.div
            animate={{ width: `${hpPct}%` }}
            transition={{ duration: 0.3 }}
            className="h-full bg-gradient-to-r from-red-700 to-red-500"
          />
        </div>
        <AnimatePresence>
          {dmgNumbers.map((d, idx) => {
            const big = d.crit
            return (
              <motion.span
                key={d.id}
                initial={{ opacity: 1, y: 0, scale: big ? 1.4 : 1 }}
                animate={{ opacity: 0, y: -28, scale: big ? 1.15 : 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: big ? 0.85 : 0.7, ease: 'easeOut' }}
                className="absolute -top-1 pointer-events-none font-mono font-black tabular-nums"
                style={{
                  right: `${4 + idx * (big ? 28 : 22)}px`,
                  color: big ? '#fde047' : '#fbbf24',
                  fontSize: big ? '20px' : '15px',
                  textShadow: '0 2px 6px rgba(0,0,0,0.9), 0 0 10px rgba(251,191,36,0.5)',
                }}
              >
                −{d.v}
              </motion.span>
            )
          })}
        </AnimatePresence>
      </div>
      <div className="flex justify-between text-micro font-mono text-gray-500 tabular-nums mb-2">
        <span className={executeMode ? 'text-red-400 font-bold' : ''}>{Math.ceil(hp)}</span>
        <span>/ {Math.ceil(boss.hp)}</span>
      </div>
      {!dead && (
        <div className="flex items-center justify-between text-caption font-mono">
          <span className="text-emerald-400">⚔ +{outgoingDps.toFixed(1)}/s</span>
          <span className="text-red-400">♥ −{incomingDps.toFixed(1)}/s</span>
        </div>
      )}
    </motion.div>
  )
}

function MobCard({ mob, hp, isFocused, outgoingDps, incomingDps, dmgNumbers, killNonce }: {
  mob: MobDef
  hp: number
  isFocused: boolean
  outgoingDps: number
  incomingDps: number
  dmgNumbers: Array<{ id: string; v: number; crit: boolean }>
  killNonce: number
}) {
  const dead = hp <= 0
  const hpPct = Math.max(0, Math.min(100, (hp / mob.hp) * 100))
  const hit = !dead && dmgNumbers.length > 0
  const hitFlash = hit ? dmgNumbers[dmgNumbers.length - 1].id : null
  const lowHp = !dead && hpPct < 25

  // Compact view when dead — just icon + crossed name + KILLED tag.
  // Frees visual space and pushes the eye to alive mobs.
  if (dead) {
    return (
      <motion.div
        animate={{ opacity: 0.45, scale: 0.92 }}
        transition={{ duration: 0.3 }}
        className="rounded-card border border-white/[0.04] bg-surface-1 p-2 flex flex-col items-center justify-center min-h-[88px]"
      >
        <div className="relative w-10 h-10 rounded border border-white/5 bg-black/30 flex items-center justify-center mb-1 grayscale">
          {mob.image
            ? <img src={mob.image} alt="" className="w-8 h-8 object-contain opacity-60" style={{ imageRendering: 'pixelated' }} />
            : mob.icon
              ? <span className="text-xl opacity-60">{mob.icon}</span>
              : <Skull className="w-6 h-6 text-gray-500" />}
          <span className="absolute inset-0 flex items-center justify-center text-red-500/60 font-black text-2xl leading-none select-none" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>×</span>
        </div>
        <p className="text-micro text-gray-600 line-through truncate w-full text-center">{mob.name}</p>
        <p className="text-[9px] font-mono uppercase tracking-wider mt-0.5 text-gray-700">killed</p>
      </motion.div>
    )
  }

  const borderStyle = isFocused
    ? 'border-amber-500/60 bg-amber-500/[0.08] ring-1 ring-inset ring-amber-500/25'
    : lowHp
      ? 'border-red-500/40 bg-red-500/[0.05]'
      : 'border-white/[0.08] bg-surface-2'
  return (
    <motion.div
      animate={{
        opacity: 1,
        scale: hit ? 1.04 : 1,
        boxShadow: hit
          ? '0 0 14px -2px rgba(251,191,36,0.55)'
          : lowHp
            ? '0 0 14px -4px rgba(239,68,68,0.45)'
            : '0 0 0 rgba(0,0,0,0)',
      }}
      transition={{ duration: 0.25 }}
      className={`relative rounded-card border p-2.5 overflow-hidden ${borderStyle}`}
    >
      {/* Particle burst on death */}
      {killNonce > 0 && <DeathParticles key={killNonce} color="#fbbf24" count={12} radius={42} />}
      {/* Hit flash overlay */}
      <AnimatePresence>
        {hitFlash && (
          <motion.div
            key={hitFlash}
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="absolute inset-0 rounded-card pointer-events-none bg-white"
          />
        )}
      </AnimatePresence>
      <div className="flex flex-col items-center mb-1.5">
        <div className="w-12 h-12 rounded border border-white/10 bg-black/30 flex items-center justify-center mb-1">
          {mob.image
            ? <img src={mob.image} alt="" className="w-10 h-10 object-contain" style={{ imageRendering: 'pixelated' }} />
            : mob.icon
              ? <span className="text-2xl">{mob.icon}</span>
              : <Skull className="w-7 h-7 text-gray-300" />}
        </div>
        <p className="text-micro font-semibold text-center truncate w-full text-white">
          {mob.name}
        </p>
        {(isFocused || lowHp) && (
          <p className={`text-[9px] font-mono uppercase tracking-wider mt-0.5 ${
            isFocused ? 'text-amber-400' : 'text-red-400'
          }`}>
            {isFocused ? '◎ focused' : '⚠ low hp'}
          </p>
        )}
      </div>

      <div className="relative mb-1">
        <div className="h-1.5 rounded-full overflow-hidden bg-black/40">
          <motion.div
            animate={{
              width: `${hpPct}%`,
              opacity: lowHp ? [1, 0.65, 1] : 1,
            }}
            transition={{
              width: { duration: 0.3 },
              opacity: lowHp ? { duration: 1.1, repeat: Infinity } : { duration: 0 },
            }}
            className={`h-full ${dead ? 'bg-gray-700' : lowHp ? 'bg-red-500' : 'bg-emerald-500'}`}
          />
        </div>
        <AnimatePresence>
          {dmgNumbers.map((d, idx) => {
            const big = d.crit
            // Start above name (HP bar sits ~22px below name baseline) so floating
            // numbers never collide with the mob's name text on initial frame.
            return (
              <motion.span
                key={d.id}
                initial={{ opacity: 1, y: -22, scale: big ? 1.4 : 1 }}
                animate={{ opacity: 0, y: -46, scale: big ? 1.15 : 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: big ? 0.85 : 0.7, ease: 'easeOut' }}
                className="absolute -top-1 pointer-events-none font-mono font-black tabular-nums"
                style={{
                  right: `${idx * (big ? 22 : 14)}px`,
                  color: big ? '#fde047' : '#fbbf24',
                  fontSize: big ? '16px' : '11px',
                  textShadow: '0 1px 3px rgba(0,0,0,0.95), 0 0 10px rgba(251,191,36,0.55)',
                }}
              >
                −{d.v}
              </motion.span>
            )
          })}
        </AnimatePresence>
      </div>
      <div className="flex justify-between text-micro font-mono text-gray-500 tabular-nums mb-1">
        <span>{Math.ceil(hp)}</span>
        <span>/ {Math.ceil(mob.hp)}</span>
      </div>
      {!dead && (
        <div className="flex justify-between text-micro font-mono">
          <span className="text-emerald-400">+{outgoingDps.toFixed(1)}</span>
          <span className="text-red-400">−{incomingDps.toFixed(1)}</span>
        </div>
      )}
    </motion.div>
  )
}

function RunLootChip({ loot }: { loot: { kind: string; id: string; qty: number } }) {
  const motionProps = {
    initial: { scale: 0.4, opacity: 0, y: -6 },
    animate: { scale: 1, opacity: 1, y: 0 },
    exit: { scale: 0.4, opacity: 0 },
    transition: { type: 'spring' as const, stiffness: 500, damping: 28 },
  }
  // Gold is now aggregated upstream, but keep handler for safety.
  if (loot.kind === 'gold') {
    return (
      <motion.span
        {...motionProps}
        className="px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-micro font-mono text-amber-400 tabular-nums inline-flex items-center gap-0.5"
      >
        <Coins className="w-3 h-3" />+{fmt(loot.qty)}
      </motion.span>
    )
  }
  const display = resolveItemDisplay(loot.id)
  const theme = RARITY_THEME[normalizeRarityForTheme(display.rarity)]
  return (
    <motion.span
      {...motionProps}
      title={`${display.name}${loot.qty > 1 ? ` ×${loot.qty}` : ''}`}
      className="pl-1 pr-2 py-0.5 rounded-full text-micro font-mono inline-flex items-center gap-1 border max-w-[140px]"
      style={{ borderColor: theme.border, background: `${theme.color}15`, color: theme.color }}
    >
      <LootVisual icon={display.icon} image={display.image} className="w-3.5 h-3.5 object-contain text-xs flex items-center justify-center shrink-0" />
      <span className="truncate">{display.name}</span>
      {loot.qty > 1 && <span className="tabular-nums shrink-0 opacity-80">×{loot.qty}</span>}
    </motion.span>
  )
}

function normalizeRarityForTheme(r: string) {
  if (r === 'mythic' || r === 'mythical') return 'mythical' as const
  if (r === 'legendary') return 'legendary' as const
  if (r === 'epic') return 'epic' as const
  if (r === 'rare') return 'rare' as const
  return 'common' as const
}

function bossAsMob(boss: { id: string; name: string; icon: string; image?: string; hp: number; atk: number; def?: number; atkSpread?: number }): MobDef {
  return {
    id: boss.id, name: boss.name, icon: boss.icon, image: boss.image,
    hp: boss.hp, atk: boss.atk, def: boss.def, atkSpread: boss.atkSpread,
    xpReward: 0, goldMin: 0, goldMax: 0,
  }
}

// ExtractResultScreen + ResultRow moved to <DelveResultModal />, which renders in DelvePage
// when pendingResult is set (covers both in-tab extract and off-tab end).
