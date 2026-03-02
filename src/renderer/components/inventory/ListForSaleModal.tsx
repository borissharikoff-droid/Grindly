import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { LOOT_ITEMS, MARKETPLACE_BLOCKED_ITEMS } from '../../lib/loot'
import { createListing } from '../../services/marketplaceService'
import { useAuthStore } from '../../stores/authStore'
import { useInventoryStore } from '../../stores/inventoryStore'
import { useGoldStore } from '../../stores/goldStore'
import { playClickSound } from '../../lib/sounds'

interface ListForSaleModalProps {
  itemId: string
  onClose: () => void
  onListed: () => void
}

export function ListForSaleModal({ itemId, onClose, onListed }: ListForSaleModalProps) {
  const user = useAuthStore((s) => s.user)
  const gold = useGoldStore((s) => s.gold)
  const [price, setPrice] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const item = LOOT_ITEMS.find((x) => x.id === itemId)
  const isBlocked = MARKETPLACE_BLOCKED_ITEMS.includes(itemId)
  const priceNum = Math.max(1, Math.floor(Number(price) || 0))
  const commission = Math.max(1, Math.floor(priceNum * 0.05))

  const handleList = async () => {
    if (!user) return
    setError(null)
    setLoading(true)
    const { deleteItem, grantItemForTesting } = useInventoryStore.getState()
    const { addGold, setGold, gold, syncToSupabase } = useGoldStore.getState()
    if (gold < commission) {
      setLoading(false)
      setError(`Commission ${commission} gold required (5% of price)`)
      return
    }
    setGold(gold - commission)
    syncToSupabase(user.id).catch(() => {})
    deleteItem(itemId, 1)
    const res = await createListing(user.id, itemId, 1, priceNum)
    setLoading(false)
    if (res.ok) {
      playClickSound()
      onListed()
    } else {
      addGold(commission) // Rollback commission
      syncToSupabase(user.id).catch(() => {})
      grantItemForTesting(itemId, 1) // Rollback item
      setError(res.error ?? 'Failed to list')
    }
  }

  const content = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-[320px] rounded-xl bg-discord-card border border-white/10 p-4 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-white mb-1">List for sale</p>
        <p className="text-[11px] text-gray-400 mb-3">
          {item?.name ?? itemId} — set your price in gold
        </p>
        {isBlocked && (
          <p className="text-[11px] text-red-400 mb-2">This item cannot be listed on the marketplace.</p>
        )}
        <p className="text-[10px] text-amber-400/80 mb-2">
          5% commission: {commission} gold (charged when listing)
        </p>
        <input
          type="number"
          min={1}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Price (gold)"
          className="grindly-no-spinner w-full px-3 py-2 rounded-lg bg-discord-darker border border-white/15 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyber-neon/50"
        />
        {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-white/15 text-gray-400 text-xs hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleList}
            disabled={loading || !price.trim() || priceNum < 1 || gold < commission || isBlocked}
            className="flex-1 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-semibold hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Listing...' : 'List'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
  return typeof document !== 'undefined' ? createPortal(content, document.body) : null
}
