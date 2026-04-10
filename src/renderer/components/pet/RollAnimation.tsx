import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PETS, getPetDef, type PetInstance } from '../../lib/pets'
import { getSkillById } from '../../lib/skills'
import { playLootRaritySound, playClickSound } from '../../lib/sounds'
import { MOTION } from '../../lib/motion'

// ── Rarity theming ────────────────────────────────────────────────────────────

const RARITY_GLOW_COLOR: Record<string, string> = {
  common:    'rgba(156,163,175,0.25)',
  rare:      'rgba(96,165,250,0.35)',
  epic:      'rgba(168,85,247,0.40)',
  legendary: 'rgba(251,191,36,0.50)',
  mythic:    'rgba(244,114,182,0.60)',
}

const RARITY_BORDER: Record<string, string> = {
  common:    'border-gray-500/40',
  rare:      'border-blue-400/50',
  epic:      'border-purple-400/60',
  legendary: 'border-amber-400/70',
  mythic:    'border-pink-400/80',
}

const RARITY_TEXT: Record<string, string> = {
  common:    'text-gray-300',
  rare:      'text-blue-300',
  epic:      'text-purple-300',
  legendary: 'text-amber-300',
  mythic:    'text-pink-300',
}

const RARITY_BG: Record<string, string> = {
  common:    'bg-gray-500/10',
  rare:      'bg-blue-500/10',
  epic:      'bg-purple-500/10',
  legendary: 'bg-amber-500/10',
  mythic:    'bg-pink-500/10',
}

// Pets in rarity order for biased cycling
const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic']

function getPetPoolForPhase(targetRarity: string, phase: 'fast' | 'slow'): string[] {
  if (phase === 'fast') return PETS.map((p) => p.emoji)
  // Slowing: show pets at ±1 rarity tier to build tension
  const idx = RARITY_ORDER.indexOf(targetRarity)
  const tiers = RARITY_ORDER.slice(Math.max(0, idx - 1), idx + 1)
  const pool = PETS.filter((p) => tiers.includes(p.rarity)).map((p) => p.emoji)
  return pool.length > 0 ? pool : PETS.map((p) => p.emoji)
}

// ── Shockwave ring (epic+) ────────────────────────────────────────────────────

function ShockwaveRing({ rarity }: { rarity: string }) {
  const color = {
    epic:      'rgba(168,85,247,0.6)',
    legendary: 'rgba(251,191,36,0.7)',
    mythic:    'rgba(244,114,182,0.8)',
  }[rarity]
  if (!color) return null
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{ border: `2px solid ${color}`, top: '50%', left: '50%' }}
      initial={{ width: 80, height: 80, x: '-50%', y: '-50%', opacity: 1 }}
      animate={{ width: 280, height: 280, x: '-50%', y: '-50%', opacity: 0 }}
      transition={{ duration: 0.7, ease: 'easeOut' }}
    />
  )
}

// ── Floating particles (legendary+) ──────────────────────────────────────────

function Particles({ rarity }: { rarity: string }) {
  if (rarity !== 'legendary' && rarity !== 'mythic') return null
  const emoji = rarity === 'mythic' ? ['✨', '🌟', '💫', '⭐'] : ['✨', '💛', '🌟', '⚡']
  const count = rarity === 'mythic' ? 12 : 8
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * 360
        const dist = 80 + Math.random() * 60
        const rad = (angle * Math.PI) / 180
        const tx = Math.cos(rad) * dist
        const ty = Math.sin(rad) * dist
        return (
          <motion.span
            key={i}
            className="absolute text-base pointer-events-none select-none"
            style={{ top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}
            initial={{ opacity: 1, x: 0, y: 0, scale: 0.5 }}
            animate={{ opacity: 0, x: tx, y: ty, scale: 1.4 }}
            transition={{ duration: 0.8 + Math.random() * 0.4, ease: 'easeOut', delay: Math.random() * 0.1 }}
          >
            {emoji[i % emoji.length]}
          </motion.span>
        )
      })}
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type Phase = 'fast' | 'slow' | 'revealed'

interface RollAnimationProps {
  pet: PetInstance
  onDone: () => void
}

export function RollAnimation({ pet, onDone }: RollAnimationProps) {
  const def = getPetDef(pet.defId)
  const rarity = def?.rarity ?? 'common'
  const skill = def ? getSkillById(def.skillId) : null
  const name = pet.customName ?? def?.name ?? 'Pet'

  const [phase, setPhase] = useState<Phase>('fast')
  const [displayEmoji, setDisplayEmoji] = useState(PETS[0].emoji)
  const [showShockwave, setShowShockwave] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef = useRef(0)
  const clickTickRef = useRef(0)

  useEffect(() => {
    // ── Phase 1: fast spin (0–1100ms) ──────────────────────────────────────
    const fastPool = getPetPoolForPhase(rarity, 'fast')
    intervalRef.current = setInterval(() => {
      tickRef.current++
      clickTickRef.current++
      const emoji = fastPool[Math.floor(Math.random() * fastPool.length)]
      setDisplayEmoji(emoji)
      // Play a subtle click every 5 ticks to add sound rhythm
      if (clickTickRef.current % 5 === 0) playClickSound()
    }, 65)

    const t1 = setTimeout(() => {
      // ── Phase 2: slow down (1100–2100ms) ───────────────────────────────
      if (intervalRef.current) clearInterval(intervalRef.current)
      setPhase('slow')
      const slowPool = getPetPoolForPhase(rarity, 'slow')
      let delay = 120
      let count = 0
      const maxTicks = 7

      const slowTick = () => {
        count++
        const isLast = count >= maxTicks
        const emoji = isLast ? (def?.emoji ?? slowPool[0]) : slowPool[Math.floor(Math.random() * slowPool.length)]
        setDisplayEmoji(emoji)
        if (!isLast) playClickSound()

        if (!isLast) {
          delay = Math.min(delay * 1.35, 420)
          intervalRef.current = setTimeout(slowTick, delay)
        } else {
          // ── Phase 3: reveal ────────────────────────────────────────────
          setTimeout(() => {
            setPhase('revealed')
            setShowShockwave(true)
            playLootRaritySound(rarity)
            setTimeout(() => setShowShockwave(false), 800)
          }, 180)
        }
      }

      intervalRef.current = setTimeout(slowTick, delay)
    }, 1100)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current as unknown as number)
        clearTimeout(intervalRef.current as unknown as number)
      }
      clearTimeout(t1)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const glowColor = RARITY_GLOW_COLOR[rarity] ?? RARITY_GLOW_COLOR.common
  const isHighRarity = rarity === 'legendary' || rarity === 'mythic'

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={phase === 'revealed' ? onDone : undefined}
      style={{ cursor: phase === 'revealed' ? 'pointer' : 'default' }}
    >
      {/* Backdrop — darkens and tints with rarity color on reveal */}
      <motion.div
        className="absolute inset-0"
        animate={{
          backgroundColor: phase === 'revealed'
            ? `color-mix(in srgb, ${glowColor} 15%, rgba(0,0,0,0.85))`
            : 'rgba(0,0,0,0.75)',
        }}
        transition={{ duration: 0.5 }}
      />

      {/* Legendary/mythic: animated border flash on overlay */}
      {isHighRarity && phase === 'revealed' && (
        <motion.div
          className={`absolute inset-2 rounded-card border-2 pointer-events-none ${RARITY_BORDER[rarity]}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.4] }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      )}

      {/* Center slot */}
      <div className="relative flex flex-col items-center gap-5 z-10">

        {/* Glow disc behind emoji */}
        <motion.div
          className="absolute rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)` }}
          animate={{
            width:   phase === 'fast' ? 100 : phase === 'slow' ? 160 : 240,
            height:  phase === 'fast' ? 100 : phase === 'slow' ? 160 : 240,
            opacity: phase === 'fast' ? 0.3 : phase === 'slow' ? 0.6 : 1,
          }}
          transition={{ duration: 0.4 }}
        />

        {/* Slot box */}
        <motion.div
          className={`relative w-32 h-32 rounded-2xl flex items-center justify-center border-2 ${
            phase === 'revealed' ? RARITY_BORDER[rarity] : 'border-white/[0.08]'
          } ${phase === 'revealed' ? RARITY_BG[rarity] : 'bg-surface-1/60'}`}
          animate={phase === 'revealed' ? { scale: [1, 1.18, 0.95, 1.06, 1] } : { scale: 1 }}
          transition={phase === 'revealed' ? { duration: 0.5, ease: 'easeInOut' } : {}}
        >
          {/* Shockwave */}
          <AnimatePresence>
            {showShockwave && <ShockwaveRing key="shock" rarity={rarity} />}
          </AnimatePresence>

          {/* Particles */}
          <AnimatePresence>
            {phase === 'revealed' && <Particles key="particles" rarity={rarity} />}
          </AnimatePresence>

          {/* Emoji */}
          <AnimatePresence mode="popLayout">
            <motion.span
              key={displayEmoji + phase}
              className="text-6xl leading-none select-none"
              initial={{ scale: 0.7, opacity: 0.6 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.7, opacity: 0 }}
              transition={{ duration: phase === 'fast' ? 0.05 : 0.12 }}
            >
              {phase === 'revealed' ? def?.emoji : displayEmoji}
            </motion.span>
          </AnimatePresence>
        </motion.div>

        {/* Info row — appears on reveal */}
        <AnimatePresence>
          {phase === 'revealed' && (
            <motion.div
              className="flex flex-col items-center gap-2 text-center"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...MOTION.spring.soft, delay: 0.18 }}
            >
              <span className={`text-2xl font-bold text-white`}>{name}</span>
              <span className={`text-sm font-mono font-bold px-3 py-1 rounded-full border ${RARITY_BORDER[rarity]} ${RARITY_BG[rarity]} ${RARITY_TEXT[rarity]}`}>
                {rarity}
              </span>
              {def && (
                <span className="text-caption font-mono text-gray-400">
                  {def.skillId === 'all'
                    ? '✨ Buffs all skills'
                    : skill ? `${skill.icon} +${def.baseBuffPct}% ${skill.name} XP` : `+${def.baseBuffPct}%`}
                </span>
              )}
              <motion.p
                className="text-micro font-mono text-gray-600 mt-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
              >
                tap to continue
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Phase label during spin */}
        {phase !== 'revealed' && (
          <motion.div
            className="flex gap-1"
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ repeat: Infinity, duration: 0.6 }}
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-white/30"
                animate={{ scale: [1, 1.5, 1] }}
                transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.15 }}
              />
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
