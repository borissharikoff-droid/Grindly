import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDelveStore, selectActiveRun } from '../../stores/delveStore'
import { useInventoryStore } from '../../stores/inventoryStore'
import { LOOT_ITEMS, LOOT_SLOTS, type LootSlot } from '../../lib/loot'
import { LootVisual, RARITY_THEME } from '../loot/LootUI'
import { FoodSelector } from '../shared/FoodSelector'
import type { FoodLoadoutSlot } from '../../lib/combat'
import { Star, Heart, Shield, Sword, X, Sparkles } from '../../lib/icons'
import { playClickSound } from '../../lib/sounds'

type Subview = 'menu' | 'food' | 'gear' | null

export function DelveSafeSpotPanel() {
  const run = useDelveStore(selectActiveRun)
  const refreshFood = useDelveStore((s) => s.refreshFoodLoadout)
  const drinkHeal = useDelveStore((s) => s.drinkHealPotion)
  const swapGear = useDelveStore((s) => s.swapEquippedDuringRun)
  const inv = useInventoryStore()

  const [subview, setSubview] = useState<Subview>(null)
  // Food draft — local state until user confirms (to avoid re-render storm in store).
  const [foodDraft, setFoodDraft] = useState<(FoodLoadoutSlot | null)[]>(() => {
    const slots: (FoodLoadoutSlot | null)[] = [null, null, null]
    if (run) for (let i = 0; i < Math.min(3, run.foodLoadout.length); i++) slots[i] = run.foodLoadout[i] ?? null
    return slots
  })

  if (!run) return null

  const maxHp = run.playerSnapshot.hp
  const hpPct = Math.max(0, Math.min(100, (run.playerHp / maxHp) * 100))
  const hpFull = run.playerHp >= maxHp
  const potionsOwned = inv.items['hp_potion'] ?? 0
  const canHeal = !hpFull && potionsOwned > 0

  function handleHeal() {
    playClickSound()
    drinkHeal()
  }

  function handleConfirmFood() {
    playClickSound()
    refreshFood(foodDraft)
    setSubview(null)
  }

  function handleSwap(slot: LootSlot, itemId: string | null) {
    playClickSound()
    swapGear(slot, itemId)
  }

  return (
    <div className="rounded-card border border-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.05] to-surface-2 p-4 space-y-3">
      {/* ── Header ── */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-0.5">
          <Star className="w-4 h-4 text-emerald-400" />
          <p className="text-body font-bold text-emerald-200">Safe Sector</p>
        </div>
        <p className="text-caption text-gray-500">Catch your breath. Re-arm. Push deeper.</p>
      </div>

      {/* ── Action grid ── */}
      <div className="grid grid-cols-3 gap-2">
        {/* Heal */}
        <button
          type="button"
          onClick={handleHeal}
          disabled={!canHeal}
          className={`rounded border p-2.5 text-left transition-colors ${
            canHeal
              ? 'border-emerald-500/30 bg-emerald-500/[0.08] hover:bg-emerald-500/15'
              : 'border-white/[0.06] bg-surface-3 cursor-not-allowed opacity-60'
          }`}
          title={hpFull ? 'Already at full HP' : potionsOwned <= 0 ? 'No HP potions in inventory' : 'Drink HP potion — full heal'}
        >
          <div className="flex items-center gap-1 mb-0.5">
            <Heart className={`w-3 h-3 ${canHeal ? 'text-emerald-400' : 'text-gray-600'}`} />
            <p className={`text-micro uppercase tracking-wider font-mono ${canHeal ? 'text-emerald-300' : 'text-gray-600'}`}>Heal</p>
          </div>
          <p className={`text-caption font-bold tabular-nums ${canHeal ? 'text-emerald-200' : 'text-gray-500'}`}>
            {hpFull ? 'Full HP' : `${Math.ceil(run.playerHp)} / ${Math.ceil(maxHp)}`}
          </p>
          <p className={`text-micro font-mono mt-0.5 ${potionsOwned > 0 ? 'text-emerald-400/70' : 'text-gray-600'}`}>
            {potionsOwned > 0 ? `${potionsOwned} pot${potionsOwned === 1 ? '' : 's'}` : 'no potions'}
          </p>
        </button>

        {/* Food */}
        <button
          type="button"
          onClick={() => { playClickSound(); setSubview('food') }}
          className="rounded border border-orange-500/25 bg-orange-500/[0.06] hover:bg-orange-500/[0.12] p-2.5 text-left transition-colors"
        >
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-micro" style={{ color: '#fb923c' }}>🍳</span>
            <p className="text-micro uppercase tracking-wider text-orange-300 font-mono">Food</p>
          </div>
          <p className="text-caption font-bold text-orange-200">
            {run.foodLoadout.filter((s) => s && s.qty > 0).length}/3
          </p>
          <p className="text-micro font-mono text-orange-400/70 mt-0.5">refresh</p>
        </button>

        {/* Gear */}
        <button
          type="button"
          onClick={() => { playClickSound(); setSubview('gear') }}
          className="rounded border border-delve/25 bg-delve/[0.06] hover:bg-delve/[0.12] p-2.5 text-left transition-colors"
        >
          <div className="flex items-center gap-1 mb-0.5">
            <Sword className="w-3 h-3 text-delve" />
            <p className="text-micro uppercase tracking-wider text-delve font-mono">Gear</p>
          </div>
          <p className="text-caption font-bold text-white">
            {LOOT_SLOTS.filter((s) => inv.equippedBySlot[s]).length}/{LOOT_SLOTS.length}
          </p>
          <p className="text-micro font-mono text-delve/70 mt-0.5">swap</p>
        </button>
      </div>

      {/* ── Subview drawer ── */}
      <AnimatePresence>
        {subview === 'food' && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="rounded border border-white/[0.06] bg-surface-1 p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <p className="text-caption font-semibold text-white">Refresh food loadout</p>
              <button
                type="button"
                onClick={() => setSubview(null)}
                className="w-6 h-6 rounded text-gray-500 hover:text-white hover:bg-white/[0.06] flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <FoodSelector
              slots={foodDraft}
              onChange={setFoodDraft}
              ownedItems={inv.items}
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSubview(null)}
                className="px-3 py-1.5 rounded border border-white/10 text-gray-300 text-caption hover:bg-white/[0.04]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmFood}
                className="px-3 py-1.5 rounded border border-orange-500/40 bg-orange-500/15 text-orange-200 text-caption font-bold hover:bg-orange-500/25"
              >
                Apply
              </button>
            </div>
          </motion.div>
        )}

        {subview === 'gear' && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="rounded border border-white/[0.06] bg-surface-1 p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <p className="text-caption font-semibold text-white">Manage gear</p>
              <button
                type="button"
                onClick={() => setSubview(null)}
                className="w-6 h-6 rounded text-gray-500 hover:text-white hover:bg-white/[0.06] flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {run.mode === 'hardcore' && (
              <p className="text-micro font-mono text-amber-400/80 leading-relaxed">
                ⚠ HC: items staked at launch stay at risk regardless of swaps. Swapping changes what you wear, not what's locked in.
              </p>
            )}
            <div className="space-y-1.5">
              {LOOT_SLOTS.map((slot) => (
                <GearSlotRow
                  key={slot}
                  slot={slot}
                  equippedId={inv.equippedBySlot[slot] ?? null}
                  ownedItems={inv.items}
                  onSwap={handleSwap}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick player stat strip */}
      <div className="grid grid-cols-4 gap-2 pt-1">
        <StatChip icon={<Heart className="w-3 h-3" />} label="HP" value={`${Math.ceil(run.playerHp)}/${Math.ceil(maxHp)}`} tone="emerald" pct={hpPct} />
        <StatChip icon={<Sword className="w-3 h-3" />} label="ATK" value={`${Math.round(run.playerSnapshot.atk)}`} tone="orange" />
        <StatChip icon={<Shield className="w-3 h-3" />} label="DEF" value={`${run.playerSnapshot.def}`} tone="indigo" />
        <StatChip icon={<Sparkles className="w-3 h-3" />} label="REG" value={`+${run.playerSnapshot.hpRegen}`} tone="emerald" />
      </div>
    </div>
  )
}

function StatChip({ icon, label, value, tone, pct }: {
  icon: React.ReactNode
  label: string
  value: string
  tone: 'emerald' | 'orange' | 'indigo'
  pct?: number
}) {
  const toneClass = tone === 'emerald' ? 'text-emerald-400' : tone === 'orange' ? 'text-orange-300' : 'text-indigo-300'
  return (
    <div className="rounded border border-white/[0.06] bg-surface-2 px-2 py-1.5">
      <div className={`flex items-center gap-1 mb-0.5 ${toneClass}`}>
        {icon}
        <p className="text-micro font-mono uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-caption font-mono font-bold tabular-nums text-white truncate">{value}</p>
      {pct !== undefined && (
        <div className="h-0.5 mt-1 rounded-full bg-white/[0.04] overflow-hidden">
          <div className={`h-full ${tone === 'emerald' ? 'bg-emerald-400' : tone === 'orange' ? 'bg-orange-400' : 'bg-indigo-400'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}

function GearSlotRow({ slot, equippedId, ownedItems, onSwap }: {
  slot: LootSlot
  equippedId: string | null
  ownedItems: Record<string, number>
  onSwap: (slot: LootSlot, itemId: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const equipped = equippedId ? LOOT_ITEMS.find((i) => i.id === equippedId) : null
  // Items in this slot that the user owns (and isn't currently wearing in this slot)
  const candidates = LOOT_ITEMS.filter((i) => i.slot === slot && (ownedItems[i.id] ?? 0) > 0 && i.id !== equippedId)
  const canSwap = candidates.length > 0 || equippedId !== null

  const eqTheme = equipped ? RARITY_THEME[equipped.rarity === 'mythic' ? 'mythical' : equipped.rarity] : null

  return (
    <div className="rounded border border-white/[0.06] bg-surface-2">
      <button
        type="button"
        onClick={() => canSwap && setOpen((v) => !v)}
        disabled={!canSwap}
        className={`w-full px-2.5 py-2 flex items-center gap-2.5 text-left ${canSwap ? 'hover:bg-white/[0.04]' : 'cursor-default'}`}
      >
        <span className="w-14 text-micro uppercase font-mono text-gray-500 tracking-wider shrink-0">{slot}</span>
        <div className="w-8 h-8 rounded border flex items-center justify-center shrink-0"
          style={equipped && eqTheme
            ? { borderColor: eqTheme.border, background: `${eqTheme.color}15` }
            : { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}
        >
          {equipped
            ? <LootVisual icon={equipped.icon} image={equipped.image} className="w-7 h-7 object-contain" scale={1} />
            : <span className="text-micro text-gray-700">—</span>}
        </div>
        <span className={`flex-1 truncate text-caption ${equipped ? 'text-white' : 'text-gray-500 italic'}`}>
          {equipped ? equipped.name : 'empty'}
        </span>
        {canSwap && (
          <span className="text-micro font-mono text-gray-500 shrink-0">
            {open ? '▴' : '▾'} {candidates.length} alt
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden border-t border-white/[0.04]"
          >
            <div className="p-1.5 space-y-1 max-h-48 overflow-y-auto">
              {equippedId && (
                <button
                  type="button"
                  onClick={() => { onSwap(slot, null); setOpen(false) }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-white/[0.04] transition-colors"
                >
                  <span className="w-7 h-7 rounded border border-white/10 bg-white/[0.02] flex items-center justify-center text-gray-600">×</span>
                  <span className="flex-1 text-micro font-mono text-gray-400">Unequip</span>
                </button>
              )}
              {candidates.length === 0 && !equippedId && (
                <p className="text-micro font-mono text-gray-600 text-center py-2">No alternatives in inventory</p>
              )}
              {candidates.map((item) => {
                const theme = RARITY_THEME[item.rarity === 'mythic' ? 'mythical' : item.rarity]
                const owned = ownedItems[item.id] ?? 0
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { onSwap(slot, item.id); setOpen(false) }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-white/[0.04] transition-colors"
                  >
                    <span
                      className="w-7 h-7 rounded border flex items-center justify-center shrink-0"
                      style={{ borderColor: theme.border, background: `${theme.color}15` }}
                    >
                      <LootVisual icon={item.icon} image={item.image} className="w-6 h-6 object-contain" scale={1} />
                    </span>
                    <span className="flex-1 truncate text-caption" style={{ color: theme.color }}>
                      {item.name}
                    </span>
                    {owned > 1 && <span className="text-micro font-mono text-gray-500 tabular-nums shrink-0">×{owned}</span>}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
