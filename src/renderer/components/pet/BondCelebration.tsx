import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { getPetDef, type PetInstance } from '../../lib/pets'
import { MOTION } from '../../lib/motion'

const MILESTONE_LABELS: Record<string, string> = {
  day7:    '7 days together',
  day30:   '30 days together',
  feed50:  '50 feedings',
  feed100: '100 feedings',
  lv10:    'Level 10 reached',
}

const MILESTONE_ICONS: Record<string, string> = {
  day7:    '🗓️',
  day30:   '🌙',
  feed50:  '🍗',
  feed100: '👑',
  lv10:    '✨',
}

function ConfettiParticles() {
  const items = ['❤️', '✨', '🎉', '💫', '⭐', '🌟']
  const count = 14
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * 360
        const dist = 90 + Math.random() * 70
        const rad = (angle * Math.PI) / 180
        const tx = Math.cos(rad) * dist
        const ty = Math.sin(rad) * dist
        return (
          <motion.span
            key={i}
            className="absolute text-base pointer-events-none select-none"
            style={{ top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}
            initial={{ opacity: 1, x: 0, y: 0, scale: 0.5 }}
            animate={{ opacity: 0, x: tx, y: ty, scale: 1.3 }}
            transition={{ duration: 1.0 + Math.random() * 0.5, ease: 'easeOut', delay: Math.random() * 0.15 }}
          >
            {items[i % items.length]}
          </motion.span>
        )
      })}
    </>
  )
}

interface BondCelebrationProps {
  pet: PetInstance
  milestoneId: string
  quote: string
  onDone: () => void
}

export function BondCelebration({ pet, milestoneId, quote, onDone }: BondCelebrationProps) {
  const def = getPetDef(pet.defId)
  const isEvolution = milestoneId === 'lv10'
  const baseEmoji    = def?.emoji ?? '🥚'
  const evolvedEmoji = def?.evolvedEmoji ?? baseEmoji
  const emoji = isEvolution ? evolvedEmoji : (pet.hasEvolvedEmoji ? evolvedEmoji : baseEmoji)
  const label = MILESTONE_LABELS[milestoneId] ?? milestoneId
  const icon  = MILESTONE_ICONS[milestoneId] ?? '🎉'

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[80] flex flex-col items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={onDone}
        style={{ cursor: 'pointer', background: 'rgba(0,0,0,0.82)' }}
      >
        <div className="relative flex flex-col items-center gap-4 z-10">

          {/* Confetti burst */}
          <div className="absolute inset-0 pointer-events-none">
            <ConfettiParticles />
          </div>

          {/* Pet emoji — bounces in */}
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: [0.4, 1.25, 0.9, 1.08, 1], opacity: 1 }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
            className="text-7xl leading-none select-none"
          >
            {emoji}
          </motion.div>

          {/* Milestone label */}
          <motion.div
            className="flex flex-col items-center gap-1.5 text-center"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...MOTION.spring.soft, delay: 0.25 }}
          >
            <span className="text-xs font-mono text-gray-500 tracking-widest uppercase">Bond Milestone</span>
            <span className="text-2xl font-bold text-white">
              {icon} {label}
            </span>
            {/* Evolution callout — only for lv10 */}
            {isEvolution && baseEmoji !== evolvedEmoji && (
              <motion.div
                className="flex items-center gap-2 mt-1"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ ...MOTION.spring.soft, delay: 0.5 }}
              >
                <span className="text-2xl leading-none">{baseEmoji}</span>
                <span className="text-sm text-gray-500">→</span>
                <span className="text-2xl leading-none">{evolvedEmoji}</span>
              </motion.div>
            )}
          </motion.div>

          {/* Quote */}
          <motion.div
            className="mx-4 px-5 py-3 rounded-2xl bg-surface-2 border border-white/[0.10] max-w-[260px] text-center"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...MOTION.spring.soft, delay: 0.45 }}
          >
            <p className="text-sm text-gray-200 font-medium leading-snug">
              "{quote}"
            </p>
            <p className="text-micro font-mono text-gray-600 mt-2">— {pet.customName ?? def?.name ?? 'Your pet'}</p>
          </motion.div>

          {/* Tap hint */}
          <motion.p
            className="text-micro font-mono text-gray-600"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
          >
            tap to continue
          </motion.p>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
