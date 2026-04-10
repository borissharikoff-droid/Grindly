import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ITEM_POWER_BY_RARITY, POTION_IDS, POTION_MAX, estimateLootDropRate, getItemPower, getItemPerks, getItemPerkDescription, getSalvageOutput, LOOT_ITEMS, type LootItemDef } from '../../lib/loot'
import { getFoodItemById } from '../../lib/cooking'
import { SLOT_LABEL, LootVisual, RARITY_THEME, normalizeRarity } from '../loot/LootUI'
import { playClickSound } from '../../lib/sounds'
import { useInventoryStore } from '../../stores/inventoryStore'
import { useArenaStore } from '../../stores/arenaStore'
import { useRaidStore } from '../../stores/raidStore'

interface ItemInspectModalProps {
  item: LootItemDef | null
  locked?: boolean
  /** Hide all action buttons — for view-only contexts like Marketplace */
  viewOnly?: boolean
  /** Called when user clicks Sell — shows Sell button when provided */
  onSell?: () => void
  /** Label for the Sell button (e.g. "Sell (2)" when surplus of equipped) */
  sellLabel?: string
  onClose: () => void
}

export function ItemInspectModal({ item, locked = false, viewOnly = false, onSell, sellLabel, onClose }: ItemInspectModalProps) {
  const unequipSlot = useInventoryStore((s) => s.unequipSlot)
  const equipItem = useInventoryStore((s) => s.equipItem)
  const deleteItem = useInventoryStore((s) => s.deleteItem)
  const salvageItem = useInventoryStore((s) => s.salvageItem)
  const permanentStats = useInventoryStore((s) => s.permanentStats)
  const equippedBySlot = useInventoryStore((s) => s.equippedBySlot)
  const inBattle = Boolean(useArenaStore((s) => s.activeBattle || s.activeDungeon))
  const inRaid = Boolean(useRaidStore((s) => s.activeRaid?.status === 'active'))
  const gearLocked = inBattle || inRaid
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmSalvage, setConfirmSalvage] = useState(false)

  if (!item) return null

  const isEquipped = equippedBySlot[item.slot] === item.id
  const isEquippableGear = (['head', 'body', 'legs', 'ring', 'weapon'] as const).includes(item.slot as never)
  const rarity = normalizeRarity(item.rarity)
  const theme = RARITY_THEME[rarity]
  const ip = getItemPower(item)
  const baseWt = ITEM_POWER_BY_RARITY[item.rarity] ?? 100
  const isPlant = item.slot === 'plant'
  const isMaterial = item.slot === 'material'
  const isFood = item.slot === 'food'
  const isPotion = (POTION_IDS as readonly string[]).includes(item.id)
  const rate = !isPotion && !isPlant && !isMaterial ? estimateLootDropRate(item.id, { source: 'skill_grind', focusCategory: 'coding' }) : null
  const consumed = isPotion
    ? item.id === 'atk_potion' ? permanentStats.atk
      : item.id === 'hp_potion' ? permanentStats.hp
      : item.id === 'def_potion' ? (permanentStats.def ?? 0)
      : permanentStats.hpRegen
    : 0
  const qty = useInventoryStore.getState().items[item.id] ?? 0

  type PerkDisplay = { value: string; unit: string; desc: string; color: string }
  const perkDisplays: PerkDisplay[] = getItemPerks(item).flatMap((p): PerkDisplay[] => {
    const v = typeof p.perkValue === 'number' ? p.perkValue : parseFloat(String(p.perkValue)) || 0
    const pct = (n: number) => `+${Math.round((n - 1) * 100)}%`
    switch (p.perkType) {
      case 'atk_boost':        return [{ value: `+${v}`, unit: 'ATK/s',   desc: 'Attack',                color: '#f87171' }]
      case 'hp_boost':         return [{ value: `+${v}`, unit: 'HP',      desc: 'Max health',            color: '#4ade80' }]
      case 'hp_regen_boost':   return [{ value: `+${v}`, unit: 'HP/s',    desc: 'Health regen',          color: '#22d3ee' }]
      case 'xp_skill_boost':   return [{ value: pct(v),  unit: 'XP',      desc: p.perkTarget ?? 'Skill', color: '#a78bfa' }]
      case 'xp_global_boost':  return [{ value: pct(v),  unit: 'XP',      desc: 'All skills',            color: '#a78bfa' }]
      case 'chest_drop_boost': return [{ value: `+${Math.round(v * 100)}%`, unit: 'Drop', desc: p.perkTarget ?? 'Chests', color: '#fbbf24' }]
      case 'focus_boost':      return [{ value: pct(v),  unit: 'Focus',   desc: 'Focus sessions',        color: '#38bdf8' }]
      case 'def_boost':        return [{ value: `+${v}`, unit: 'DEF',     desc: 'Defense',               color: '#a3a3a3' }]
      case 'streak_shield':    return [{ value: '1x',    unit: 'Shield',  desc: 'Streak protect',        color: '#f97316' }]
      case 'status_title':     return [{ value: String.fromCharCode(10022), unit: String(p.perkValue || 'Title'), desc: 'Status title', color: theme.color }]
      default: return []
    }
  })

  // Combat stat comparison (gear slots only, when not already equipped)
  const salvageOutputs = getSalvageOutput(item)
  const canSalvage = salvageOutputs !== null && !isEquipped

  const isGear = (['head', 'body', 'legs', 'ring', 'weapon'] as const).includes(item.slot as never)
  const currentEquippedId = equippedBySlot[item.slot]
  const showComparison = isGear && !isEquipped && perkDisplays.some((p) => ['ATK/s', 'HP', 'HP/s', 'DEF'].includes(p.unit))
  const comparisonDiffs = showComparison ? (() => {
    const getCombatFromItem = (def: LootItemDef) => {
      let atk = 0, hp = 0, hpRegen = 0, def_ = 0
      for (const p of getItemPerks(def)) {
        const v = typeof p.perkValue === 'number' ? p.perkValue : 0
        if (p.perkType === 'atk_boost') atk += v
        if (p.perkType === 'hp_boost') hp += v
        if (p.perkType === 'hp_regen_boost') hpRegen += v
        if (p.perkType === 'def_boost') def_ += v
      }
      return { atk, hp, hpRegen, def: def_ }
    }
    const newStats = getCombatFromItem(item)
    const currentDef = currentEquippedId ? LOOT_ITEMS.find((x) => x.id === currentEquippedId) : null
    const oldStats = currentDef ? getCombatFromItem(currentDef) : { atk: 0, hp: 0, hpRegen: 0, def: 0 }
    return [
      { label: 'ATK', delta: newStats.atk - oldStats.atk, color: '#f87171' },
      { label: 'HP', delta: newStats.hp - oldStats.hp, color: '#4ade80' },
      { label: 'DEF', delta: newStats.def - oldStats.def, color: '#a3a3a3' },
      { label: 'Regen', delta: newStats.hpRegen - oldStats.hpRegen, color: '#22d3ee' },
    ].filter((d) => d.delta !== 0)
  })() : []

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[201] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 6 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28 }}
          className="w-full max-w-[370px] rounded-card border overflow-hidden relative flex"
          style={{
            borderColor: theme.border,
            background: 'rgba(8,8,16,0.98)',
            boxShadow: `0 0 40px ${theme.glow}55, 0 8px 32px rgba(0,0,0,0.7)`,
            minHeight: 220,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* LEFT - item art panel */}
          <div
            className="relative flex-shrink-0 flex flex-col items-center justify-center"
            style={{
              width: 130,
              background: `radial-gradient(ellipse at 50% 44%, ${theme.glow}50 0%, ${theme.glow}18 42%, rgba(5,5,12,0.97) 75%)`,
              borderRight: `1px solid ${theme.border}66`,
            }}
          >
            <motion.div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{ background: `radial-gradient(circle at 50% 45%, ${theme.glow}30 0%, transparent 65%)` }}
              animate={{ opacity: [0.5, 0.85, 0.5] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div className="relative z-10 flex items-center justify-center" style={{ width: 80, height: 80 }}>
              <LootVisual
                icon={item.icon}
                image={item.image}
                className="w-full h-full object-contain drop-shadow-lg"
                scale={(item.renderScale ?? 1) * 1.3}
              />
            </div>
            <div className="relative z-10 mt-3 px-2.5 py-0.5 rounded-full border text-micro font-mono font-bold uppercase tracking-widest"
              style={{ color: theme.color, borderColor: `${theme.border}99`, background: `${theme.color}18` }}>
              {rarity}
            </div>
            {qty > 1 && (
              <div className="relative z-10 mt-1.5 text-micro font-mono" style={{ color: `${theme.color}99` }}>
                x{qty}
              </div>
            )}
          </div>

          {/* RIGHT - item details */}
          <div className="flex-1 min-w-0 flex flex-col p-3.5 gap-0">
            <button
              type="button"
              onClick={onClose}
              className="absolute top-2.5 right-2.5 w-6 h-6 flex items-center justify-center rounded-full text-gray-500 hover:text-white hover:bg-white/10 transition-colors text-sm leading-none z-20"
            >x</button>

            <div className="pr-6">
              <p className="text-sm font-bold text-white leading-tight">{item.name}</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className="text-micro px-1.5 py-0.5 rounded border border-white/15 text-gray-400 font-mono uppercase tracking-wide">
                  {SLOT_LABEL[item.slot]}
                </span>
                {isEquipped && (
                  <span className="text-micro px-1.5 py-0.5 rounded border border-accent/50 text-accent font-mono tracking-wide"
                    style={{ background: 'rgba(0,255,200,0.07)' }}>
                    equipped
                  </span>
                )}
              </div>
            </div>

            {item.description && (
              <p className="text-micro text-gray-400 italic mt-1.5 leading-snug">{item.description}</p>
            )}

            {/* Perk stats */}
            <div className="mt-2.5 space-y-2">
              {perkDisplays.length > 0 && (
                <div className={`grid gap-1.5 ${perkDisplays.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  {perkDisplays.map((pd, i) => (
                    <div key={i} className="rounded px-2.5 py-2 border flex flex-col gap-0.5"
                      style={{ borderColor: `${pd.color}35`, background: `${pd.color}0e` }}>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-bold font-mono tabular-nums leading-none"
                          style={{ fontSize: perkDisplays.length === 1 ? 22 : 18, color: pd.color, textShadow: `0 0 14px ${pd.color}55` }}>
                          {pd.value}
                        </span>
                        <span className="text-micro font-mono font-semibold" style={{ color: `${pd.color}cc` }}>{pd.unit}</span>
                      </div>
                      <span className="text-micro text-gray-400 capitalize leading-none">{pd.desc}</span>
                    </div>
                  ))}
                </div>
              )}

              {isPlant && <p className="text-micro text-lime-400/80 font-mono">Farm harvest - sell on Marketplace</p>}
              {isMaterial && <p className="text-micro text-gray-400 font-mono">{getItemPerkDescription(item)}</p>}
              {isFood && (() => {
                const foodDef = getFoodItemById(item.id)
                if (!foodDef) return null
                const fx = foodDef.effect
                const stats: { value: string; unit: string; desc: string; color: string }[] = []
                if (fx.heal) stats.push({ value: `+${fx.heal}`, unit: 'HP', desc: 'Heal', color: '#4ade80' })
                if (fx.buffAtk) stats.push({ value: `+${fx.buffAtk}`, unit: 'ATK', desc: 'Attack buff', color: '#f87171' })
                if (fx.buffDef) stats.push({ value: `+${fx.buffDef}`, unit: 'DEF', desc: 'Defense buff', color: '#a3a3a3' })
                if (fx.buffRegen) stats.push({ value: `+${fx.buffRegen}`, unit: 'HP/s', desc: 'Regen buff', color: '#22d3ee' })
                if (fx.buffDurationSec) stats.push({ value: `${fx.buffDurationSec}s`, unit: '', desc: 'Buff duration', color: '#fbbf24' })
                return (
                  <div className={`grid gap-1.5 ${stats.length <= 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    {stats.map((s, i) => (
                      <div key={i} className="rounded px-2.5 py-2 border flex flex-col gap-0.5"
                        style={{ borderColor: `${s.color}35`, background: `${s.color}0e` }}>
                        <div className="flex items-baseline gap-1">
                          <span className="font-bold font-mono tabular-nums leading-none" style={{ fontSize: stats.length <= 2 ? 18 : 14, color: s.color, textShadow: `0 0 14px ${s.color}55` }}>{s.value}</span>
                          {s.unit && <span className="text-micro font-mono font-semibold" style={{ color: `${s.color}cc` }}>{s.unit}</span>}
                        </div>
                        <span className="text-micro text-gray-400 capitalize leading-none">{s.desc}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
              {item.perkType === 'cosmetic' && !isMaterial && !isFood && <p className="text-micro text-gray-400">Visual cosmetic - no gameplay effect.</p>}

              {isPotion && (
                <div>
                  <div className="flex items-center justify-between text-micro font-mono mb-1">
                    <span className="text-gray-500">Consumed</span>
                    <span className={consumed >= POTION_MAX ? 'text-amber-400' : 'text-gray-400'}>
                      {consumed}/{POTION_MAX}{consumed >= POTION_MAX ? ' - MAXED' : ''}
                    </span>
                  </div>
                  <div className="h-[3px] rounded-full bg-white/[0.07] overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (consumed / POTION_MAX) * 100)}%`, background: consumed >= POTION_MAX ? '#f59e0b' : theme.color }} />
                  </div>
                </div>
              )}

              {comparisonDiffs.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap border-t border-white/[0.05] pt-1.5">
                  <span className="text-micro text-gray-500 font-mono">vs equipped:</span>
                  {comparisonDiffs.map((d) => (
                    <span key={d.label} className="text-micro font-mono font-semibold"
                      style={{ color: d.delta > 0 ? '#4ade80' : '#f87171' }}>
                      {d.delta > 0 ? '+' : ''}{d.delta} {d.label}
                    </span>
                  ))}
                </div>
              )}

              {(['head', 'body', 'legs', 'ring', 'weapon'] as const).includes(item.slot as never) && (
                <div className="flex items-center gap-2 text-micro font-mono pt-0.5 border-t border-white/[0.05]">
                  <span className="text-gray-500">IP</span>
                  <span style={{ color: theme.color }}>{ip}</span>
                  <span className="text-white/20">-</span>
                  <span className="text-gray-500">Wt</span>
                  <span className="text-gray-300">{baseWt}</span>
                  {rate !== null && <>
                    <span className="text-white/20">-</span>
                    <span className="text-gray-500">~{rate}% drop</span>
                  </>}
                </div>
              )}
            </div>

            {/* Action buttons */}
            {!viewOnly && <div className="mt-3 flex flex-col gap-1.5">
              {/* Salvage confirm */}
              {confirmSalvage && canSalvage && salvageOutputs && (
                <div className="rounded border border-amber-400/30 bg-amber-500/10 px-2.5 py-2">
                  <p className="text-micro text-amber-300 font-mono mb-1.5">You'll receive:</p>
                  <div className="flex gap-2 mb-2">
                    {salvageOutputs.map((y) => (
                      <span key={y.id} className="text-micro font-mono text-amber-200">
                        {y.qty}× {y.id.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => { playClickSound(); salvageItem(item.id, salvageOutputs); onClose() }}
                      className="flex-1 text-micro py-1.5 rounded border border-amber-400/50 bg-amber-500/20 text-amber-200 hover:bg-amber-400/30 font-semibold transition-all active:scale-[0.97]"
                    >
                      Salvage
                    </button>
                    <button
                      type="button"
                      onClick={() => { playClickSound(); setConfirmSalvage(false) }}
                      className="flex-1 text-micro py-1.5 rounded border border-white/10 text-gray-400 hover:text-gray-300 font-semibold transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-1.5">
                {isEquippableGear && (
                  <button
                    type="button"
                    disabled={locked || gearLocked}
                    onClick={() => {
                      if (locked || gearLocked) return
                      playClickSound()
                      if (isEquipped) unequipSlot(item.slot)
                      else equipItem(item.id)
                      onClose()
                    }}
                    className={`flex-1 text-micro py-1.5 rounded border font-semibold transition-all active:scale-[0.97] ${
                      locked || gearLocked ? 'border-white/[0.08] text-gray-600 cursor-not-allowed bg-transparent' : 'hover:brightness-110'
                    }`}
                    style={locked || gearLocked ? undefined : { color: theme.color, borderColor: theme.border, backgroundColor: `${theme.color}1e` }}
                  >
                    {locked || gearLocked ? '⚔ Locked' : isEquipped ? 'Unequip' : 'Equip'}
                  </button>
                )}
                {!isEquippableGear && isEquipped && (
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => { if (!locked) { playClickSound(); unequipSlot(item.slot); onClose() } }}
                    className={`flex-1 text-micro py-1.5 rounded border font-semibold transition-all active:scale-[0.97] ${
                      locked ? 'border-white/[0.08] text-gray-600 cursor-not-allowed bg-transparent' : 'hover:brightness-110'
                    }`}
                    style={locked ? undefined : { color: theme.color, borderColor: theme.border, backgroundColor: `${theme.color}1e` }}
                  >
                    {locked ? 'Locked' : 'Unequip'}
                  </button>
                )}
                {onSell && !confirmSalvage && (
                  <button
                    type="button"
                    onClick={() => { playClickSound(); onSell() }}
                    className="flex-1 text-micro py-1.5 rounded border border-amber-500/35 text-amber-300 hover:bg-amber-500/12 font-semibold transition-all active:scale-[0.97]"
                  >
                    {sellLabel ?? 'Sell'}
                  </button>
                )}
                {!locked && !confirmSalvage && !onSell && (
                  <>
                    {canSalvage && (
                      <button
                        type="button"
                        onClick={() => { playClickSound(); setConfirmDelete(false); setConfirmSalvage(true) }}
                        className="flex-1 text-micro py-1.5 rounded border border-amber-400/30 text-amber-400/80 hover:text-amber-300 hover:bg-amber-400/10 font-semibold transition-all active:scale-[0.97]"
                        title="Salvage for materials"
                      >
                        Salvage
                      </button>
                    )}
                  </>
                )}
                {!locked && !confirmSalvage && (
                  <>
                    {confirmDelete ? (
                      <>
                        <button
                          type="button"
                          onClick={() => { playClickSound(); if (isEquipped) unequipSlot(item.slot); deleteItem(item.id, 1); onClose() }}
                          className="flex-1 text-micro py-1.5 rounded border border-red-400/50 bg-red-500/15 text-red-200 hover:bg-red-400/25 font-semibold transition-all active:scale-[0.97]"
                        >
                          Delete!
                        </button>
                        <button
                          type="button"
                          onClick={() => { playClickSound(); setConfirmDelete(false) }}
                          className="flex-1 text-micro py-1.5 rounded border border-white/10 text-gray-400 hover:text-gray-300 font-semibold transition-colors"
                        >
                          Keep
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { playClickSound(); setConfirmDelete(true) }}
                        className="w-8 h-full flex items-center justify-center rounded border border-red-400/25 text-red-400/70 hover:text-red-300 hover:bg-red-400/10 transition-all active:scale-[0.97] text-xs font-mono"
                        title="Delete"
                      >
                        ×
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
