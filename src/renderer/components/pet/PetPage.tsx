import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useAnimation } from 'framer-motion'
import { Pencil, Check, X, Zap } from '../../lib/icons'
import { usePetStore } from '../../stores/petStore'
import { FeedModal } from './FeedModal'
import {
  ADVENTURES,
  LEGENDARY_BOND,
  getPetDef,
  computeCurrentHunger,
  computePetMood,
  getPetGlobalBuffs,
  getEffectiveSkillId,
  xpToNextLevel,
  MOOD_COLOR,
  getPetLevelImage,
  type PetInstance,
  type PetMood,
} from '../../lib/pets'
import { BondCelebration } from './BondCelebration'
import { SKILLS, getSkillById } from '../../lib/skills'
import { LOOT_ITEMS } from '../../lib/loot'
import { SEED_DEFS } from '../../lib/farming'
import { AutoFarmLootModal } from '../animations/AutoFarmLootModal'
import type { AutoRunResult } from '../../stores/arenaStore'

const RARITY_GLOW: Record<string, string> = {
  common:    'shadow-[0_0_40px_rgba(156,163,175,0.12)]',
  rare:      'shadow-[0_0_40px_rgba(96,165,250,0.18)]',
  epic:      'shadow-[0_0_40px_rgba(168,85,247,0.20)]',
  legendary: 'shadow-[0_0_40px_rgba(251,191,36,0.22)]',
  mythic:    'shadow-[0_0_50px_rgba(244,114,182,0.28)]',
}

const RARITY_BADGE: Record<string, string> = {
  common:    'text-gray-400 border-gray-500/30 bg-gray-500/10',
  rare:      'text-blue-400 border-blue-500/30 bg-blue-500/10',
  epic:      'text-purple-400 border-purple-500/30 bg-purple-500/10',
  legendary: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  mythic:    'text-pink-400 border-pink-500/30 bg-pink-500/10',
}

// Subtle rarity-tinted background for the portrait disc
const RARITY_PORTRAIT_BG: Record<string, string> = {
  common:    'bg-gray-500/[0.08]',
  rare:      'bg-blue-500/[0.10]',
  epic:      'bg-purple-500/[0.12]',
  legendary: 'bg-amber-500/[0.12]',
  mythic:    'bg-pink-500/[0.15]',
}

// Ambient radial glow behind the pet portrait — changes with mood
const MOOD_AMBIENT: Record<string, string> = {
  playful:  'radial-gradient(ellipse at 50% 40%, rgba(251,146,60,0.22) 0%, transparent 65%)',
  happy:    'radial-gradient(ellipse at 50% 40%, rgba(132,204,22,0.16) 0%, transparent 65%)',
  hungry:   'radial-gradient(ellipse at 50% 40%, rgba(245,158,11,0.20) 0%, transparent 65%)',
  starving: 'radial-gradient(ellipse at 50% 40%, rgba(239,68,68,0.28) 0%, transparent 60%)',
  sleeping: 'radial-gradient(ellipse at 50% 40%, rgba(99,102,241,0.18) 0%, transparent 65%)',
  exhausted:'radial-gradient(ellipse at 50% 40%, rgba(107,114,128,0.12) 0%, transparent 65%)',
}

// Short companion voice line shown under the name
const MOOD_VOICE: Record<string, string> = {
  playful:  'wants to play!',
  happy:    'is happy and with you',
  hungry:   'is getting hungry',
  starving: 'is starving — feed me!',
  sleeping: 'is resting',
  exhausted:'is exhausted',
}

/** Starter species the user can choose from on first pet selection. */
const STARTER_SPECIES = [
  { id: 'pet_cat', label: 'Cat', desc: 'Calm & focused' },
  { id: 'pet_dog', label: 'Dog', desc: 'Loyal & energetic' },
]


function daysAgo(ms: number): number {
  return Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24))
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Done!'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (h > 0) return `${h}h ${m}m`
  const s = Math.floor((ms % 60_000) / 1_000)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function RenameField({ name, onSave }: { name: string; onSave: (n: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = () => {
    setDraft(name)
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const save = () => {
    const trimmed = draft.trim()
    if (trimmed) onSave(trimmed)
    setEditing(false)
  }

  const cancel = () => { setDraft(name); setEditing(false) }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 20))}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
          className="bg-surface-0 border border-white/[0.12] rounded px-2 py-0.5 text-lg font-bold text-white outline-none focus:border-accent/50 w-32"
          maxLength={20}
        />
        <button onClick={save} className="text-lime-400 hover:text-lime-300"><Check className="w-4 h-4" /></button>
        <button onClick={cancel} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
      </div>
    )
  }

  return (
    <button onClick={startEdit} className="flex items-center gap-1.5 group" aria-label="Rename">
      <span className="text-xl font-bold text-white">{name}</span>
      <Pencil className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 transition-colors" />
    </button>
  )
}

function FloatingHeart({ id, onDone }: { id: number; onDone: () => void }) {
  const left = 30 + Math.random() * 40
  return (
    <motion.span
      key={id}
      className="absolute text-lg pointer-events-none select-none"
      style={{ left: `${left}%`, bottom: '60%' }}
      initial={{ opacity: 1, y: 0, scale: 0.8 }}
      animate={{ opacity: 0, y: -60, scale: 1.3 }}
      transition={{ duration: 1.1, ease: 'easeOut' }}
      onAnimationComplete={onDone}
    >
      ❤️
    </motion.span>
  )
}

function PetPortrait({
  emoji,
  imageUrl,
  rarity,
  mood,
  onTap,
  size = 'md',
  sleeping = false,
}: {
  emoji: string
  imageUrl?: string | null
  rarity: string
  mood: PetMood
  onTap: () => void
  size?: 'sm' | 'md'
  sleeping?: boolean
}) {
  const controls = useAnimation()

  const handleTap = useCallback(() => {
    void controls.start({
      scale: [1, 1.35, 0.9, 1.15, 1],
      rotate: [0, -8, 8, -4, 0],
      transition: { duration: 0.45, ease: 'easeInOut' },
    })
    onTap()
  }, [controls, onTap])

  const sizeClass = size === 'sm' ? 'w-20 h-20' : 'w-28 h-28'
  const textClass = size === 'sm' ? 'text-4xl' : 'text-6xl'
  const imgClass  = size === 'sm' ? 'w-16 h-16' : 'w-24 h-24'
  const breathDuration = sleeping ? 5 : mood === 'starving' ? 0.8 : mood === 'playful' ? 1.2 : 3.5
  const portraitOpacity = mood === 'exhausted' ? 0.3 : sleeping ? 0.6 : 1

  return (
    <motion.button
      onClick={handleTap}
      className={`relative ${sizeClass} rounded-full flex items-center justify-center cursor-pointer select-none mx-auto ${RARITY_PORTRAIT_BG[rarity] ?? ''} ${(sleeping || mood === 'exhausted') ? '' : (RARITY_GLOW[rarity] ?? '')}`}
      animate={{ opacity: portraitOpacity }}
      transition={{ duration: 0.6 }}
      whileTap={{ scale: 0.92 }}
      aria-label="Tap your pet"
    >
      {/* Breathing ring */}
      <motion.div
        className={`absolute inset-0 rounded-full border ${
          rarity === 'mythic' ? 'border-pink-400/20' :
          rarity === 'legendary' ? 'border-amber-400/20' :
          rarity === 'epic' ? 'border-purple-400/15' :
          rarity === 'rare' ? 'border-blue-400/15' : 'border-white/[0.06]'
        }`}
        animate={{ scale: [1, 1.06, 1], opacity: [0.6, 0.2, 0.6] }}
        transition={{ repeat: Infinity, duration: breathDuration, ease: 'easeInOut' }}
      />
      <motion.div animate={controls} className="flex items-center justify-center">
        {imageUrl ? (
          <img src={imageUrl} alt="" className={`${imgClass} object-contain`} draggable={false} />
        ) : (
          <span className={`${textClass} leading-none`}>{emoji}</span>
        )}
      </motion.div>
    </motion.button>
  )
}

/** Speech bubble with tail pointing DOWN — sits above the portrait. */

// ── Adventure Panel ───────────────────────────────────────────────────────────

function AdventurePanel({ pet, petName }: { pet: PetInstance; petName: string }) {
  const sendOnAdventure = usePetStore((s) => s.sendOnAdventure)
  const collectAdventure = usePetStore((s) => s.collectAdventure)
  const cancelAdventure = usePetStore((s) => s.cancelAdventure)
  const [tick, setTick] = useState(0)
  const [lootResult, setLootResult] = useState<AutoRunResult | null>(null)
  const [lootNarrative, setLootNarrative] = useState<string | null>(null)

  // Tick every second while on adventure so countdown updates
  useEffect(() => {
    if (!pet.adventureId) return
    const id = setInterval(() => setTick((t) => t + 1), 1_000)
    return () => clearInterval(id)
  }, [pet.adventureId])

  const handleCollect = () => {
    const result = collectAdventure()
    if (result.success && result.reward) {
      const { reward } = result
      const mats = reward.materials.map((m) => {
        const def = LOOT_ITEMS.find((x) => x.id === m.id)
          ?? SEED_DEFS.find((x) => x.id === m.id)
        return { id: m.id, name: def?.name ?? m.id, icon: def?.icon ?? '📦', qty: m.qty }
      })
      const fakeResult: AutoRunResult = {
        runsCompleted: 1,
        totalGold: reward.gold,
        totalWarriorXP: 0,
        materials: mats,
        chests: [],
        chestResults: [],
        failed: false,
        passesUsed: 1,
      }
      setLootResult(fakeResult)
      setLootNarrative(result.narrative ?? null)
    }
  }

  const isActive = !!pet.adventureId
  const advDef = isActive ? ADVENTURES.find((a) => a.id === pet.adventureId) : null
  const elapsed = isActive && pet.adventureStartedAt ? Date.now() - pet.adventureStartedAt : 0
  const durationMs = advDef?.durationMs ?? 1
  const remaining = isActive ? Math.max(0, durationMs - elapsed) : 0
  const progressPct = isActive ? Math.min(100, (elapsed / durationMs) * 100) : 0
  const done = isActive && remaining === 0
  const hunger = computeCurrentHunger(pet)
  const tooHungry = hunger < 25
  void tick

  return (
    <div className="rounded-xl border border-white/[0.07] bg-surface-1 px-4 py-3">
      {isActive ? (
        <>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-white">
              {advDef?.icon} {advDef?.label ?? 'Adventure'}
            </span>
            <span className={`text-micro font-mono ${done ? 'text-lime-400 font-bold' : 'text-gray-400'}`}>
              {done ? '✅ Complete!' : formatCountdown(remaining)}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-0 overflow-hidden mb-2">
            <motion.div
              className={`h-full rounded-full ${done ? 'bg-lime-500' : 'bg-blue-500/70'}`}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.8, ease: 'linear' }}
            />
          </div>
          <p className="text-micro font-mono text-gray-500 mb-2">
            {petName} is out adventuring — no buff while away.
          </p>
          {done ? (
            <button
              onClick={handleCollect}
              className="w-full py-2 rounded bg-lime-500/15 border border-lime-500/30 text-lime-400 text-xs font-bold hover:bg-lime-500/25 transition-colors"
            >
              🎒 Collect Loot!
            </button>
          ) : (
            <button
              onClick={cancelAdventure}
              className="w-full py-1.5 rounded bg-white/[0.04] border border-white/[0.08] text-gray-500 text-xs font-mono hover:text-gray-300 hover:bg-white/[0.07] transition-colors"
            >
              Cancel trip (no reward)
            </button>
          )}
        </>
      ) : (
        <>
          <p className="text-xs font-semibold text-white mb-2">🗺️ Send on Adventure</p>
          {tooHungry && (
            <p className="text-micro font-mono text-red-400 mb-2">Too hungry to adventure — feed {petName} first.</p>
          )}
          <div className="space-y-1.5">
            {ADVENTURES.map((adv) => {
              const locked = pet.level < adv.minLevel
              return (
                <button
                  key={adv.id}
                  disabled={locked || tooHungry}
                  onClick={() => sendOnAdventure(adv.id)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-surface-0 border border-white/[0.06] hover:bg-white/[0.05] transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-left"
                >
                  <span className="text-xs text-white font-medium">
                    {adv.icon} {adv.label}
                  </span>
                  <span className="text-micro font-mono text-gray-500">
                    {locked ? `LVL ${adv.minLevel}+` : adv.description}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}

      <AutoFarmLootModal
        open={lootResult !== null}
        result={lootResult}
        narrative={lootNarrative}
        onClose={() => { setLootResult(null); setLootNarrative(null) }}
        petImage={getPetLevelImage(pet.defId, pet.level)}
      />
    </div>
  )
}

// ── Abilities Panel ───────────────────────────────────────────────────────────

function AbilitiesPanel({ pet, petName }: { pet: PetInstance; petName: string }) {
  const useScavenge = usePetStore((s) => s.useScavenge)
  const activateMotivationBurst = usePetStore((s) => s.activateMotivationBurst)
  const [scavengeResult, setScavengeResult] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  // Keep burst timer live
  useEffect(() => {
    const until = pet.motivationBurstActiveUntil ?? 0
    if (Date.now() >= until) return
    const id = setInterval(() => setTick((t) => t + 1), 1_000)
    return () => clearInterval(id)
  }, [pet.motivationBurstActiveUntil])
  void tick

  const handleScavenge = () => {
    const result = useScavenge()
    if (result.success && result.materials) {
      const names = result.materials
        .map((m) => {
          const def = LOOT_ITEMS.find((i) => i.id === m.id)
          return def ? `${def.icon} ${m.qty > 1 ? `×${m.qty} ` : ''}${def.name}` : m.id
        })
        .join(', ')
      setScavengeResult(names)
      setTimeout(() => setScavengeResult(null), 4_000)
    }
  }

  const scavCooldownMs = Math.max(0, (pet.scavengeLastUsedAt ?? 0) + 24 * 3_600_000 - Date.now())
  const burstActive = Date.now() < (pet.motivationBurstActiveUntil ?? 0)
  const burstRemaining = Math.max(0, (pet.motivationBurstActiveUntil ?? 0) - Date.now())
  const burstCooldownMs = Math.max(0, (pet.motivationBurstLastUsedAt ?? 0) + 3 * 24 * 3_600_000 - Date.now())
  const bondUnlocked = (pet.bondMilestonesUnlocked ?? []).includes('lv10')
  const bondDef = LEGENDARY_BOND[pet.defId]

  const hasAnyAbility = pet.level >= 3
  if (!hasAnyAbility) return null

  return (
    <div className="rounded-xl border border-white/[0.07] bg-surface-1 px-4 py-3 space-y-2">
      <p className="text-xs font-semibold text-white">⚡ Abilities</p>

      {/* Scavenge (Lv3) */}
      {pet.level >= 3 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-micro font-semibold text-gray-300">🔍 Scavenge</span>
            <span className={`text-micro font-mono ${scavCooldownMs > 0 ? 'text-gray-500' : 'text-lime-400'}`}>
              {scavCooldownMs > 0 ? formatCountdown(scavCooldownMs) : 'Ready'}
            </span>
          </div>
          <button
            disabled={scavCooldownMs > 0 || !!pet.adventureId}
            onClick={handleScavenge}
            className="w-full py-1.5 rounded bg-surface-0 border border-white/[0.06] text-micro font-mono text-gray-400 hover:text-white hover:bg-white/[0.05] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Find 1–3 common materials (24h cooldown)
          </button>
          <AnimatePresence>
            {scavengeResult && (
              <motion.p
                className="text-micro font-mono text-lime-400 mt-1"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              >
                Found: {scavengeResult}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Motivation Burst (Lv6) */}
      {pet.level >= 6 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-micro font-semibold text-gray-300">
              <Zap className="w-3 h-3 inline mr-0.5" />
              Motivation Burst
              {burstActive && <span className="ml-1 text-amber-400 font-bold">ACTIVE</span>}
            </span>
            <span className={`text-micro font-mono ${burstActive ? 'text-amber-400' : burstCooldownMs > 0 ? 'text-gray-500' : 'text-lime-400'}`}>
              {burstActive ? formatCountdown(burstRemaining) : burstCooldownMs > 0 ? formatCountdown(burstCooldownMs) : 'Ready'}
            </span>
          </div>
          {!burstActive && (
            <button
              disabled={burstCooldownMs > 0 || !!pet.adventureId}
              onClick={() => activateMotivationBurst()}
              className="w-full py-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-micro font-mono text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/15 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              +50% XP all skills for 20 min (3-day cooldown)
            </button>
          )}
          {burstActive && (
            <p className="text-micro font-mono text-amber-400 text-center">
              ⚡ {petName} is boosting your XP right now!
            </p>
          )}
        </div>
      )}

      {/* Legendary Bond (Lv10) */}
      {pet.level >= 10 && bondDef && (
        <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
          <span className="text-micro font-semibold text-gray-300">
            {bondDef.icon} Legendary Bond
          </span>
          <span className={`text-micro font-mono ${bondUnlocked ? 'text-amber-300' : 'text-gray-600'}`}>
            {bondUnlocked ? bondDef.description : 'Reach Level 10 bond milestone'}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Bond Milestones Panel ─────────────────────────────────────────────────────

const MILESTONE_DEFS = [
  { id: 'day7',   icon: '🗓️', label: '7 days',       description: 'Title: loyal companion' },
  { id: 'day30',  icon: '🌙', label: '30 days',       description: '+1% permanent buff' },
  { id: 'feed50', icon: '🍗', label: '50 feedings',   description: 'Rare food gift' },
  { id: 'feed100',icon: '👑', label: '100 feedings',  description: 'Legendary chest' },
  { id: 'lv10',   icon: '✨', label: 'Level 10',      description: 'Evolved form + legendary ability' },
]

function BondMilestonesPanel({ pet }: { pet: PetInstance }) {
  const unlocked = pet.bondMilestonesUnlocked ?? []
  const daysTogether = (Date.now() - pet.rolledAt) / (24 * 3_600_000)
  const feedings = pet.totalFeedings ?? 0

  const getProgress = (id: string): number => {
    if (id === 'day7')   return Math.min(1, daysTogether / 7)
    if (id === 'day30')  return Math.min(1, daysTogether / 30)
    if (id === 'feed50') return Math.min(1, feedings / 50)
    if (id === 'feed100')return Math.min(1, feedings / 100)
    if (id === 'lv10')   return Math.min(1, pet.level / 10)
    return 0
  }

  return (
    <div className="rounded-xl border border-white/[0.07] bg-surface-1 px-4 py-3">
      <p className="text-xs font-semibold text-white mb-2">🤝 Bond Milestones</p>
      <div className="space-y-2">
        {MILESTONE_DEFS.map((m) => {
          const done = unlocked.includes(m.id)
          const pct = getProgress(m.id)
          return (
            <div key={m.id} className={`flex items-center gap-2 ${done ? '' : 'opacity-60'}`}>
              <span className="text-base leading-none shrink-0">{m.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-micro font-semibold ${done ? 'text-white' : 'text-gray-400'}`}>
                    {m.label}
                  </span>
                  {done
                    ? <span className="text-micro font-mono text-lime-400">✓ done</span>
                    : <span className="text-micro font-mono text-gray-600">{Math.round(pct * 100)}%</span>
                  }
                </div>
                <div className="h-1 rounded-full bg-surface-0 mt-0.5 overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${done ? 'bg-lime-500' : 'bg-accent/50'}`}
                    animate={{ width: `${pct * 100}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <p className={`text-micro font-mono ${done ? 'text-gray-400' : 'text-gray-700'}`}>
                  {done ? `✓ ${m.description}` : `→ ${m.description}`}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Short display names for the skill picker grid (avoids truncation)
// ── Level-Up Skill Picker ─────────────────────────────────────────────────────

function LevelUpSkillPicker({
  pet,
  newLevel,
  onPick,
}: {
  pet: PetInstance
  newLevel: number
  onPick: (skillId: string) => void
}) {
  const def = getPetDef(pet.defId)
  const name = pet.customName ?? def?.name ?? 'Your pet'
  const currentSkillId = getEffectiveSkillId(pet)

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ background: 'rgba(0,0,0,0.88)' }}
    >
      <motion.div
        className="w-full max-w-xs rounded-card bg-surface-2 border border-white/[0.10] overflow-hidden"
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.05, duration: 0.25 }}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-white/[0.06] text-center">
          <motion.div
            className="text-4xl leading-none mb-2"
            initial={{ scale: 0.5 }}
            animate={{ scale: [0.5, 1.3, 1] }}
            transition={{ duration: 0.5 }}
          >
            ⭐
          </motion.div>
          <p className="text-sm font-bold text-white">{name} reached LVL {newLevel}!</p>
          <p className="text-micro font-mono text-gray-400 mt-0.5">Choose a skill to boost with XP:</p>
        </div>

        {/* Skill grid */}
        <div className="p-3 space-y-1.5">
          {/* All Skills — prominent option */}
          <button
            onClick={() => onPick('all')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-all text-left ${
              currentSkillId === 'all'
                ? 'border-accent/60 bg-accent/10 text-white'
                : 'border-white/[0.08] bg-surface-1 text-gray-300 hover:border-accent/30 hover:bg-white/[0.04]'
            }`}
          >
            <span className="text-xl leading-none">✨</span>
            <div>
              <div className="text-xs font-bold">All Skills</div>
              <div className="text-[9px] font-mono text-gray-500">Small bonus spread across everything</div>
            </div>
            {currentSkillId === 'all' && <span className="ml-auto text-micro text-accent">current</span>}
          </button>

          {/* Individual skills — 2 columns */}
          <div className="grid grid-cols-2 gap-1">
            {SKILLS.map((skill) => {
              const active = currentSkillId === skill.id
              return (
                <button
                  key={skill.id}
                  onClick={() => onPick(skill.id)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-all text-left ${
                    active
                      ? 'border-accent/60 bg-accent/10 text-white'
                      : 'border-white/[0.06] bg-surface-1 text-gray-400 hover:border-white/[0.15] hover:text-white'
                  }`}
                >
                  <span className="text-base leading-none shrink-0">{skill.icon}</span>
                  <span className="text-xs font-medium truncate">{skill.name}</span>
                  {active && <span className="ml-auto text-micro text-accent shrink-0">✓</span>}
                </button>
              )
            })}
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  )
}

// ── Pet Buff Panel ────────────────────────────────────────────────────────────

function SkillAssignPanel({ pet }: { pet: PetInstance }) {
  const def = getPetDef(pet.defId)

  const effectiveSkillId = getEffectiveSkillId(pet)
  const assignedSkill = effectiveSkillId === 'all' ? null : getSkillById(effectiveSkillId)

  const hunger = computeCurrentHunger(pet)
  const hungerFactor = hunger >= 50 ? 1 : hunger > 0 ? hunger / 50 : 0
  const levelFactor = 1 + (pet.level - 1) * 0.1
  const bondBonus = pet.buffBonus ?? 0
  const xpPct = (def?.baseBuffPct ?? 5) * hungerFactor * levelFactor + bondBonus
  const globalBuffs = getPetGlobalBuffs(pet)
  const buffActive = hunger > 0 && !pet.adventureId

  const nextLevel = pet.level + 1

  const HP_REGEN_TABLE = [0,0,0,1,1,1,2,2,2,3,3]
  const ATK_TABLE      = [0,0,0,0,0,1,1,2,2,3,3]
  const GOLD_TABLE     = [0,0,0,0,0,0,0,3,5,7,10]

  const nextHpRegen = nextLevel <= 10 ? HP_REGEN_TABLE[nextLevel] : null
  const nextAtk     = nextLevel <= 10 ? ATK_TABLE[nextLevel] : null
  const nextGold    = nextLevel <= 10 ? GOLD_TABLE[nextLevel] : null
  const buffWillImprove =
    (nextHpRegen !== null && nextHpRegen > (HP_REGEN_TABLE[pet.level] ?? 0)) ||
    (nextAtk     !== null && nextAtk     > (ATK_TABLE[pet.level]      ?? 0)) ||
    (nextGold    !== null && nextGold    > (GOLD_TABLE[pet.level]     ?? 0))

  return (
    <div className="rounded-xl border border-white/[0.07] bg-surface-1 px-4 py-3 space-y-3">

      {/* Header */}
      <p className="text-xs font-semibold text-white">🐾 Pet Buffs</p>

      {/* Buff cards — 3 in a row */}
      <div className="grid grid-cols-3 gap-1.5">
        {/* XP buff */}
        <div className={`rounded-lg border px-2.5 py-2 ${buffActive ? 'border-lime-500/30 bg-lime-500/[0.06]' : 'border-white/[0.05] bg-surface-0 opacity-50'}`}>
          <div className="text-lg font-bold text-lime-400 leading-none">+{xpPct.toFixed(1)}%</div>
          <div className="text-[9px] font-mono text-gray-400 mt-0.5">XP bonus</div>
          <div className="text-[9px] font-mono text-gray-600 truncate">
            {assignedSkill ? `${assignedSkill.icon} ${assignedSkill.name}` : '✨ all skills'}
          </div>
          {bondBonus > 0 && (
            <div className="text-[9px] font-mono text-amber-500/70 mt-0.5">+{bondBonus}% bond</div>
          )}
        </div>

        {/* HP regen */}
        <div className={`rounded-lg border px-2.5 py-2 ${buffActive && globalBuffs.hpRegen > 0 ? 'border-red-500/30 bg-red-500/[0.06]' : 'border-white/[0.05] bg-surface-0 opacity-50'}`}>
          {globalBuffs.hpRegen > 0 ? (
            <>
              <div className="text-lg font-bold text-red-400 leading-none">+{globalBuffs.hpRegen.toFixed(1)}</div>
              <div className="text-[9px] font-mono text-gray-400 mt-0.5">HP Regen</div>
              <div className="text-[9px] font-mono text-gray-600">arena</div>
            </>
          ) : (
            <>
              <div className="text-lg font-bold text-gray-700 leading-none">—</div>
              <div className="text-[9px] font-mono text-gray-600 mt-0.5">HP Regen</div>
              <div className="text-[9px] font-mono text-gray-700">LVL 3 unlock</div>
            </>
          )}
        </div>

        {/* ATK */}
        <div className={`rounded-lg border px-2.5 py-2 ${buffActive && globalBuffs.atk > 0 ? 'border-orange-500/30 bg-orange-500/[0.06]' : 'border-white/[0.05] bg-surface-0 opacity-50'}`}>
          {globalBuffs.atk > 0 ? (
            <>
              <div className="text-lg font-bold text-orange-400 leading-none">+{globalBuffs.atk.toFixed(1)}</div>
              <div className="text-[9px] font-mono text-gray-400 mt-0.5">ATK</div>
              <div className="text-[9px] font-mono text-gray-600">arena</div>
            </>
          ) : (
            <>
              <div className="text-lg font-bold text-gray-700 leading-none">—</div>
              <div className="text-[9px] font-mono text-gray-600 mt-0.5">ATK</div>
              <div className="text-[9px] font-mono text-gray-700">LVL 5 unlock</div>
            </>
          )}
        </div>
      </div>

      {/* Gold bonus — shows from LVL 5 onward */}
      {(globalBuffs.goldPct > 0 || pet.level >= 5) && (
        <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${buffActive && globalBuffs.goldPct > 0 ? 'border-amber-500/30 bg-amber-500/[0.06]' : 'border-white/[0.05] bg-surface-0 opacity-50'}`}>
          <span className="text-sm leading-none">💰</span>
          <div>
            <div className={`text-xs font-bold ${globalBuffs.goldPct > 0 ? 'text-amber-400' : 'text-gray-700'}`}>
              {globalBuffs.goldPct > 0 ? `+${globalBuffs.goldPct.toFixed(1)}%` : '—'}
            </div>
            <div className="text-[9px] font-mono text-gray-600">
              {globalBuffs.goldPct > 0 ? 'Arena gold bonus' : 'Gold bonus — LVL 7 unlock'}
            </div>
          </div>
        </div>
      )}

      {/* Level-up hint — no duplicate bar, hero card already shows XP */}
      {pet.level < 10 ? (
        buffWillImprove && (
          <p className="text-micro font-mono text-accent/80">↑ LVL {nextLevel} will improve your buffs — keep feeding!</p>
        )
      ) : (
        <p className="text-micro font-mono text-amber-400 text-center">✨ Max level — all buffs active</p>
      )}
    </div>
  )
}

// ── Active Pet Card ───────────────────────────────────────────────────────────

function ActivePetCard() {
  const activePet = usePetStore((s) => s.activePet)
  const renamePet = usePetStore((s) => s.renamePet)
  const petPetAction = usePetStore((s) => s.petPet)
  const reassignSkill = usePetStore((s) => s.reassignSkill)
  const pendingCelebration = usePetStore((s) => s.pendingCelebration)
  const clearPendingCelebration = usePetStore((s) => s.clearPendingCelebration)
  const [showFeed, setShowFeed] = useState(false)
  const [hearts, setHearts] = useState<number[]>([])
  const heartIdRef = useRef(0)
  const [quote, setQuote] = useState<string | null>(null)
  const [pendingLevelUp, setPendingLevelUp] = useState<number | null>(null)

  const def = activePet ? getPetDef(activePet.defId) : null

  const hunger = activePet ? computeCurrentHunger(activePet) : 0
  const mood = activePet ? computePetMood(activePet) : 'happy'
  const isSleeping = mood === 'sleeping'
  const daysCount = activePet ? daysAgo(activePet.rolledAt) : 0
  const burstActive = activePet ? Date.now() < (activePet.motivationBurstActiveUntil ?? 0) : false
  const displayEmoji = activePet?.hasEvolvedEmoji && def?.evolvedEmoji ? def.evolvedEmoji : (def?.emoji ?? '🥚')
  const levelImage = activePet ? getPetLevelImage(activePet.defId, activePet.level) : null

  // Mount: check milestones
  useEffect(() => {
    usePetStore.getState().checkBondMilestones()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!activePet || !def) return null

  const name = activePet.customName ?? def.name
  const needed = xpToNextLevel(activePet.level)
  const xpPct = activePet.level >= 10 ? 100 : Math.min(100, (activePet.xp / needed) * 100)

  const handleTap = () => {
    const id = ++heartIdRef.current
    setHearts((h) => [...h, id])
    const result = petPetAction()
    if (result.success) {
      if (result.leveledUp && activePet) {
        setPendingLevelUp(activePet.level + 1)
      } else {
        setQuote('+1 XP 🐾')
        setTimeout(() => setQuote(null), 1_800)
      }
    } else if (result.error === 'Already played today (10/10)') {
      setQuote('Max pets today!')
      setTimeout(() => setQuote(null), 1_800)
    }
  }

  const removeHeart = (id: number) => setHearts((h) => h.filter((x) => x !== id))

  return (
    <>
      <div className="flex flex-col gap-3">

        {/* ── HERO CARD ───────────────────────────────────────────── */}
        <div className="relative rounded-xl border border-white/[0.07] bg-surface-1 px-4 py-4 overflow-hidden">

          {/* Mood ambient glow — always present, changes with mood */}
          <div
            className="absolute inset-0 pointer-events-none transition-all duration-1000"
            style={{ background: MOOD_AMBIENT[mood] ?? MOOD_AMBIENT.happy }}
          />

          {/* Burst glow */}
          {burstActive && (
            <motion.div
              className="absolute inset-0 pointer-events-none"
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              style={{ background: 'radial-gradient(ellipse at center, rgba(251,191,36,0.12) 0%, transparent 70%)' }}
            />
          )}

          {/* Floating hearts */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {hearts.map((id) => <FloatingHeart key={id} id={id} onDone={() => removeHeart(id)} />)}
          </div>

          {/* Tap quote toast */}
          <AnimatePresence>
            {quote && (
              <motion.div
                className="absolute top-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <span className="text-xs font-bold text-lime-400 bg-black/60 rounded px-2 py-0.5">{quote}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Vertical hero layout ── */}
          <div className="flex flex-col items-center gap-3 relative z-10">

            {/* Portrait — dims when sleeping */}
            <PetPortrait emoji={displayEmoji} imageUrl={levelImage} rarity={def.rarity} mood={mood} onTap={handleTap} size="md" sleeping={isSleeping} />

            {/* Name + badges row */}
            <div className="flex flex-col items-center gap-1.5">
              <RenameField name={name} onSave={renamePet} />
              <div className="flex items-center gap-2">
                <span className={`text-micro font-mono font-bold px-2 py-0.5 rounded-full border ${RARITY_BADGE[def.rarity] ?? RARITY_BADGE.common}`}>
                  {def.rarity}
                </span>
                {activePet.adventureId && <span title="On adventure">🗺️</span>}
                {burstActive && (
                  <motion.span
                    title="Motivation Burst active"
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ repeat: Infinity, duration: 0.8 }}
                  >⚡</motion.span>
                )}
              </div>
              {/* Companion voice — gives the pet personality */}
              <p className={`text-xs font-mono italic ${MOOD_COLOR[mood]}`}>
                {name} {MOOD_VOICE[mood] ?? 'is by your side'}
              </p>
            </div>

            {/* Hunger + XP bars — full width */}
            <div className="w-full space-y-2">
              <div>
                <div className="flex justify-between text-micro font-mono mb-1">
                  <span className="text-gray-500">🍗 Hunger</span>
                  <span className={hunger < 25 ? 'text-red-400 font-bold' : 'text-gray-400'}>
                    {hunger}%
                    {hunger > 0 && (() => {
                      // decay: 100% over 24h → threshold in hours
                      const hoursUntilHungry = (hunger - 25) * 24 / 100
                      const hoursUntilEmpty  = hunger * 24 / 100
                      if (hunger <= 25) {
                        const mins = Math.round(hoursUntilEmpty * 60)
                        return <span className="text-red-500 ml-1">· starves in {mins < 60 ? `${mins}m` : `${Math.round(hoursUntilEmpty)}h`}</span>
                      }
                      const h = Math.floor(hoursUntilHungry)
                      const m = Math.round((hoursUntilHungry - h) * 60)
                      const label = h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`
                      return <span className="text-gray-600 ml-1">· hungry in {label}</span>
                    })()}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-0 overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${hunger < 25 ? 'bg-red-500' : hunger < 50 ? 'bg-amber-500' : 'bg-lime-500'}`}
                    animate={{ width: `${hunger}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-micro font-mono mb-1">
                  <span className="text-gray-500">⭐ XP</span>
                  <span className="text-gray-600">{activePet.level >= 10 ? 'MAX' : `${activePet.xp}/${needed}`}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-0 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-accent"
                    animate={{ width: `${xpPct}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
              </div>
            </div>

            {/* Compact stats row */}
            <div className="w-full grid grid-cols-3 gap-1 text-center">
              <div>
                <div className="text-micro font-mono text-gray-500">Level</div>
                <div className="text-xs font-bold text-white">{activePet.level}<span className="text-gray-600">/10</span></div>
              </div>
              <div>
                <div className="text-micro font-mono text-gray-500">Together</div>
                <div className="text-xs font-bold text-white">{daysCount === 0 ? '1' : daysCount}<span className="text-gray-600"> {daysCount === 1 || daysCount === 0 ? 'day' : 'days'}</span></div>
              </div>
              <div>
                <div className="text-micro font-mono text-gray-500">Pats today</div>
                <div className="text-xs font-bold text-white">
                  {(() => {
                    const today = new Date().toDateString()
                    const count = activePet.pettedDate === today ? (activePet.pettedCount ?? 0) : 0
                    return <span className={count >= 10 ? 'text-gray-500' : ''}>{count}<span className="text-gray-600">/10</span></span>
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Action buttons ── */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowFeed(true)}
            disabled={!!activePet.adventureId}
            className="flex-1 py-2.5 rounded-lg bg-lime-500/15 border border-lime-500/30 text-lime-400 text-xs font-bold hover:bg-lime-500/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            🍗 Feed {name}
          </button>
          <button
            onClick={handleTap}
            disabled={!!activePet.adventureId || hunger === 0}
            title="Pat your pet (+1 XP, max 10/day)"
            className="px-3 py-2.5 rounded-lg bg-pink-500/10 border border-pink-500/20 text-pink-400 text-sm hover:bg-pink-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            🤍
          </button>
        </div>

        <SkillAssignPanel pet={activePet} />
        <AdventurePanel pet={activePet} petName={name} />
        <AbilitiesPanel pet={activePet} petName={name} />
        <BondMilestonesPanel pet={activePet} />
      </div>

      {showFeed && (
        <FeedModal
          onClose={() => setShowFeed(false)}
          onFed={(leveledUp) => {
            usePetStore.getState().checkBondMilestones()
            if (leveledUp && activePet) {
              setPendingLevelUp(activePet.level + 1)
            } else {
              setQuote('Fed! 🍗')
              setTimeout(() => setQuote(null), 1_800)
            }
          }}
        />
      )}

      {/* Level-up skill picker overlay */}
      {pendingLevelUp !== null && activePet && (
        <LevelUpSkillPicker
          pet={activePet}
          newLevel={pendingLevelUp}
          onPick={(skillId) => {
            reassignSkill(skillId)
            setPendingLevelUp(null)
            setQuote(`LVL ${pendingLevelUp}! 🎉`)
            setTimeout(() => setQuote(null), 2_000)
          }}
        />
      )}

      {/* Bond celebration overlay */}
      {pendingCelebration && activePet && (
        <BondCelebration
          pet={activePet}
          milestoneId={pendingCelebration.milestoneId}
          quote={pendingCelebration.quote}
          onDone={clearPendingCelebration}
        />
      )}
    </>
  )
}

// ── Species Chooser (first-time experience) ───────────────────────────────────

function SpeciesChooser({ onChoose }: { onChoose: (speciesId: string) => void }) {
  return (
    <motion.div
      className="rounded-card border border-dashed border-white/[0.10] p-6 text-center space-y-5"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
    >
      <div>
        <p className="text-sm font-semibold text-white">Choose your companion</p>
        <p className="text-micro font-mono text-gray-500 mt-1 leading-relaxed">
          Feed and care for your pet to level it up. A well-fed pet gives you XP bonuses, arena buffs, and finds materials while you work.
        </p>
      </div>

      {/* Cat + Dog cards — big, image-based */}
      <div className="grid grid-cols-2 gap-3">
        {STARTER_SPECIES.map((s) => {
          const def = getPetDef(s.id)
          if (!def) return null
          const img = getPetLevelImage(s.id, 1)
          return (
            <button
              key={s.id}
              onClick={() => onChoose(s.id)}
              className="flex flex-col items-center gap-2 py-5 px-3 rounded-xl bg-surface-1 border border-white/[0.07] hover:border-accent/40 hover:bg-accent/[0.04] transition-all group"
            >
              {img ? (
                <img src={img} alt={s.label} className="w-20 h-20 object-contain group-hover:scale-105 transition-transform" draggable={false} />
              ) : (
                <span className="text-5xl leading-none group-hover:scale-105 transition-transform">{def.emoji}</span>
              )}
              <span className="text-sm font-bold text-white">{s.label}</span>
              <span className="text-micro font-mono text-gray-500">{s.desc}</span>
              <span className={`text-micro font-mono font-bold px-1.5 py-0.5 rounded border ${RARITY_BADGE[def.rarity] ?? RARITY_BADGE.common}`}>
                {def.rarity}
              </span>
            </button>
          )
        })}
      </div>

    </motion.div>
  )
}

export function PetPage() {
  const activePet = usePetStore((s) => s.activePet)
  const rollPet = usePetStore((s) => s.rollPet)
  // If stored pet species no longer exists (old save), treat as no pet
  const validPet = activePet && getPetDef(activePet.defId) ? activePet : null

  const handleChooseSpecies = (speciesId: string) => {
    rollPet({ speciesId })
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-sm font-bold text-white">Pet</h2>
      </div>

      <div className="px-4 pb-6 space-y-4">
        <AnimatePresence mode="wait">
          {validPet ? (
            <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <ActivePetCard />
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <SpeciesChooser onChoose={handleChooseSpecies} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  )
}
