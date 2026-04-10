import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from '../../lib/icons'
import { LOOT_ITEMS, getRarityTheme } from '../../lib/loot'
import { useInventoryStore } from '../../stores/inventoryStore'
import { usePetStore } from '../../stores/petStore'
import { useNavigationStore } from '../../stores/navigationStore'
import { getFoodFeedValue, computeCurrentHunger } from '../../lib/pets'
import { getFoodItemById } from '../../lib/cooking'
import { LootVisual } from '../loot/LootUI'
import { MOTION } from '../../lib/motion'

const RARITY_COLORS: Record<string, string> = {
  common:    'text-gray-400',
  rare:      'text-blue-400',
  epic:      'text-purple-400',
  legendary: 'text-amber-400',
  mythic:    'text-pink-400',
}

interface FeedModalProps {
  onClose: () => void
  onFed: (leveledUp: boolean) => void
}

export function FeedModal({ onClose, onFed }: FeedModalProps) {
  const items = useInventoryStore((s) => s.items)
  const feedPet = usePetStore((s) => s.feedPet)
  const activePet = usePetStore((s) => s.activePet)
  const navigateTo = useNavigationStore((s) => s.navigateTo)
  const currentHunger = activePet ? computeCurrentHunger(activePet) : 0

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const foodItems = LOOT_ITEMS
    .filter((item) => item.slot === 'food' && (items[item.id] ?? 0) > 0)
    .sort((a, b) => {
      const order = ['mythic', 'legendary', 'epic', 'rare', 'common']
      return order.indexOf(a.rarity) - order.indexOf(b.rarity)
    })

  const handleFeed = (itemId: string) => {
    const result = feedPet(itemId)
    if (result.success) {
      onFed(result.leveledUp)
      onClose()
    }
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-60 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="w-full max-w-xs rounded-card bg-surface-2 border border-white/[0.08] shadow-popup overflow-hidden"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 16, opacity: 0 }}
          transition={MOTION.spring.soft}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <span className="text-sm font-semibold text-white">Feed your pet</span>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Hunger bar */}
          <div className="px-4 pt-3 pb-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-micro font-mono text-gray-500">Hunger</span>
              <span className={`text-micro font-mono ${currentHunger < 25 ? 'text-red-400' : 'text-gray-400'}`}>
                {currentHunger}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-0 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  currentHunger < 25 ? 'bg-red-500' : currentHunger < 50 ? 'bg-amber-500' : 'bg-lime-500'
                }`}
                style={{ width: `${currentHunger}%` }}
              />
            </div>
          </div>

          {/* Food list */}
          <div className="px-2 py-2 max-h-[340px] overflow-y-auto space-y-0.5">
            {foodItems.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-6 px-2">
                <p className="text-center text-micro font-mono text-gray-500">
                  No food in inventory yet.
                </p>
                <button
                  onClick={() => { navigateTo?.('cooking'); onClose() }}
                  className="px-4 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-colors"
                >
                  🍳 Go to Cooking →
                </button>
              </div>
            ) : (
              foodItems.map((item) => {
                const qty = items[item.id] ?? 0
                const { hungerRestore, petXp } = getFoodFeedValue(item.rarity)
                const foodDef = getFoodItemById(item.id)
                const theme = getRarityTheme(item.rarity)
                return (
                  <button
                    key={item.id}
                    onClick={() => handleFeed(item.id)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded hover:bg-white/[0.06] transition-colors text-left"
                  >
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                      style={{ background: '#0a0a14', border: `1px solid ${theme.border}`, boxShadow: `0 0 10px ${theme.glow}` }}
                    >
                      <LootVisual icon={item.icon} image={foodDef?.image} className="w-9 h-9 object-contain" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-white truncate">{item.name}</div>
                      <div className="text-micro font-mono text-gray-500">
                        <span className={RARITY_COLORS[item.rarity] ?? 'text-gray-400'}>
                          {item.rarity}
                        </span>
                        {' · '}
                        <span className="text-lime-500">+{hungerRestore}🍗</span>
                        {' · '}
                        <span className="text-accent">+{petXp} XP</span>
                      </div>
                    </div>
                    <span className="text-micro font-mono text-gray-500 shrink-0">×{qty}</span>
                  </button>
                )
              })
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
