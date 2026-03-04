import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CHEST_DEFS, LOOT_ITEMS, LOOT_SLOTS, MARKETPLACE_BLOCKED_ITEMS, POTION_IDS, POTION_MAX, estimateLootDropRate, getItemPower, type ChestType, type LootSlot, getItemPerkDescription } from '../../lib/loot'
import { computePlayerStats } from '../../lib/combat'
import { ensureInventoryHydrated, useInventoryStore } from '../../stores/inventoryStore'
import { useArenaStore } from '../../stores/arenaStore'
import { useAdminConfigStore } from '../../stores/adminConfigStore'
import { ChestOpenModal } from '../animations/ChestOpenModal'
import { ListForSaleModal } from './ListForSaleModal'
import { PageHeader } from '../shared/PageHeader'
import { playClickSound, playPotionSound } from '../../lib/sounds'
import { syncInventoryToSupabase } from '../../services/supabaseSync'
import { useNotificationStore } from '../../stores/notificationStore'
import { useFarmStore } from '../../stores/farmStore'
import { SLOT_META, SLOT_LABEL, LootVisual, RARITY_THEME, normalizeRarity } from '../loot/LootUI'
import { BuffTooltip } from '../shared/BuffTooltip'

type SlotEntry =
  | { id: string; kind: 'pending'; icon: string; image?: string; title: string; subtitle: string; quantity: number; rewardIds: string[]; chestType: ChestType }
  | { id: string; kind: 'chest'; icon: string; image?: string; title: string; subtitle: string; quantity: number; chestType: ChestType }
  | { id: string; kind: 'item'; icon: string; image?: string; title: string; subtitle: string; quantity: number; itemId: string; equipped: boolean }

export function InventoryPage({ onBack }: { onBack: () => void }) {
  useAdminConfigStore((s) => s.rev) // re-render when admin config updates (item skins etc.)
  const items = useInventoryStore((s) => s.items)
  const chests = useInventoryStore((s) => s.chests)
  const pendingRewards = useInventoryStore((s) => s.pendingRewards)
  const equippedBySlot = useInventoryStore((s) => s.equippedBySlot)
  const permanentStats = useInventoryStore((s) => s.permanentStats)
  const claimPendingReward = useInventoryStore((s) => s.claimPendingReward)
  const deletePendingReward = useInventoryStore((s) => s.deletePendingReward)
  const openChestAndGrantItem = useInventoryStore((s) => s.openChestAndGrantItem)
  const deleteChest = useInventoryStore((s) => s.deleteChest)
  const equipItem = useInventoryStore((s) => s.equipItem)
  const unequipSlot = useInventoryStore((s) => s.unequipSlot)
  const deleteItem = useInventoryStore((s) => s.deleteItem)
  const consumePotion = useInventoryStore((s) => s.consumePotion)
  const inBattle = Boolean(useArenaStore((s) => s.activeBattle))
  const [sortBy, setSortBy] = useState<'rarity' | 'name' | 'slot'>('rarity')
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'compact'>('grid')
  const [filterBy, setFilterBy] = useState<'all' | 'combat' | 'weapons' | 'xp' | 'drops' | 'potions' | 'chests' | 'cosmetic' | 'plants'>('all')
  const [inspectSlotId, setInspectSlotId] = useState<string | null>(null)
  const [listForSaleTarget, setListForSaleTarget] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; slotId: string } | null>(null)
  const [openChestModal, setOpenChestModal] = useState<{ chestType: ChestType; itemId: string; seedZipTier: import('../../lib/farming').SeedZipTier | null; goldDropped: number } | null>(null)
  const [chestModalAnimSeed, setChestModalAnimSeed] = useState(0)
  const [chestChainMessage, setChestChainMessage] = useState<string | null>(null)

  const slots = useMemo<SlotEntry[]>(() => {
    const out: SlotEntry[] = []
    const pendingByChest = new Map<ChestType, { rewardIds: string[]; sources: Set<string> }>()
    for (const reward of pendingRewards.filter((r) => !r.claimed)) {
      const current = pendingByChest.get(reward.chestType) ?? { rewardIds: [], sources: new Set<string>() }
      current.rewardIds.push(reward.id)
      current.sources.add(reward.source)
      pendingByChest.set(reward.chestType, current)
    }
    for (const [chestType, grouped] of pendingByChest) {
      const chest = CHEST_DEFS[chestType]
      out.push({
        id: `pending:${chestType}`,
        kind: 'pending',
        icon: chest.icon,
        image: chest.image,
        title: chest.name,
        subtitle: `Inbox drops · ${grouped.sources.size > 1 ? 'mixed sources' : Array.from(grouped.sources)[0] ?? 'grind'}`,
        quantity: grouped.rewardIds.length,
        rewardIds: grouped.rewardIds,
        chestType,
      })
    }
    for (const chestType of Object.keys(CHEST_DEFS) as ChestType[]) {
      const qty = chests[chestType] ?? 0
      if (qty <= 0) continue
      const chest = CHEST_DEFS[chestType]
      out.push({
        id: `chest:${chestType}`,
        kind: 'chest',
        icon: chest.icon,
        image: chest.image,
        title: chest.name,
        subtitle: `${chest.rarity.toUpperCase()} bag`,
        quantity: qty,
        chestType,
      })
    }
    for (const item of LOOT_ITEMS) {
      const qty = items[item.id] ?? 0
      if (qty <= 0) continue
      out.push({
        id: `item:${item.id}`,
        kind: 'item',
        icon: item.icon,
        image: item.image,
        title: item.name,
        subtitle: getItemPerkDescription(item),
        quantity: qty,
        itemId: item.id,
        equipped: equippedBySlot[item.slot] === item.id,
      })
    }
    return out
  }, [pendingRewards, chests, items, equippedBySlot])

  const RARITY_ORDER: Record<string, number> = { mythic: 5, legendary: 4, epic: 3, rare: 2, common: 1 }
  const getSlotRarity = (slot: SlotEntry) => {
    if (slot.kind === 'item') return LOOT_ITEMS.find((x) => x.id === slot.itemId)?.rarity ?? 'common'
    if (slot.kind === 'chest' || slot.kind === 'pending') return CHEST_DEFS[slot.chestType].rarity
    return 'common'
  }

  const FILTERS = [
    { id: 'all',     label: 'All',      icon: '🎒' },
    { id: 'weapons', label: 'Weapons',  icon: '⚔️' },
    { id: 'combat',  label: 'Combat',   icon: '🛡️' },
    { id: 'xp',      label: 'XP',       icon: '📈' },
    { id: 'drops',   label: 'Drops',    icon: '🎁' },
    { id: 'potions', label: 'Potions',  icon: '⚗️' },
    { id: 'chests',  label: 'Bags',     icon: '📦' },
    { id: 'cosmetic',label: 'Cosmetic', icon: '✨' },
    { id: 'plants',  label: 'Plants',   icon: '🌿' },
  ] as const

  const slotMatchesFilterId = (slot: SlotEntry, fid: string): boolean => {
    if (fid === 'all') return true
    if (fid === 'chests') return slot.kind === 'chest' || slot.kind === 'pending'
    if (slot.kind !== 'item') return false
    const item = LOOT_ITEMS.find((x) => x.id === slot.itemId)
    if (!item) return false
    if (fid === 'weapons')  return item.slot === 'weapon'
    if (fid === 'combat')   return ['atk_boost', 'hp_boost', 'hp_regen_boost'].includes(item.perkType as string)
    if (fid === 'xp')       return ['xp_skill_boost', 'xp_global_boost', 'focus_boost'].includes(item.perkType as string)
    if (fid === 'drops')    return (item.perkType as string) === 'chest_drop_boost'
    if (fid === 'potions')  return item.slot === 'consumable'
    if (fid === 'cosmetic') return ['cosmetic', 'status_title', 'streak_shield'].includes(item.perkType as string)
    if (fid === 'plants')   return item.slot === 'plant'
    return true
  }

  const slotMatchesFilter = (slot: SlotEntry) => slotMatchesFilterId(slot, filterBy)

  const filterCounts = useMemo(() => {
    const counts: Partial<Record<string, number>> = {}
    for (const f of FILTERS) {
      if (f.id === 'all') { counts[f.id] = slots.length; continue }
      counts[f.id] = slots.filter((s) => slotMatchesFilterId(s, f.id)).length
    }
    return counts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots])

  const SLOT_SORT_ORDER: Record<string, number> = {
    weapon: 0, head: 1, body: 2, legs: 3, ring: 4, consumable: 5, plant: 6,
  }

  const sortedSlots = useMemo(() => {
    const kindOrder = (s: SlotEntry) => (s.kind === 'pending' ? 0 : s.kind === 'chest' ? 1 : 2)
    return [...slots]
      .filter(slotMatchesFilter)
      .sort((a, b) => {
        const kd = kindOrder(a) - kindOrder(b)
        if (kd !== 0) return kd
        if (sortBy === 'rarity') return (RARITY_ORDER[getSlotRarity(b)] ?? 0) - (RARITY_ORDER[getSlotRarity(a)] ?? 0)
        if (sortBy === 'slot') {
          const aSlot = a.kind === 'item' ? (LOOT_ITEMS.find((x) => x.id === a.itemId)?.slot ?? '') : ''
          const bSlot = b.kind === 'item' ? (LOOT_ITEMS.find((x) => x.id === b.itemId)?.slot ?? '') : ''
          return (SLOT_SORT_ORDER[aSlot] ?? 99) - (SLOT_SORT_ORDER[bSlot] ?? 99)
        }
        return a.title.localeCompare(b.title)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, sortBy, filterBy])

  const groupedSlots = useMemo(() => {
    if (filterBy !== 'all') return null
    const pending = sortedSlots.filter((s) => s.kind === 'pending')
    const bags = sortedSlots.filter((s) => s.kind === 'chest')
    const regularItems = sortedSlots.filter((s) => s.kind === 'item')
    const groups: { label: string; icon: string; slots: SlotEntry[] }[] = []
    if (pending.length > 0) groups.push({ label: 'Inbox', icon: '📥', slots: pending })
    if (bags.length > 0) groups.push({ label: 'Bags', icon: '📦', slots: bags })
    if (regularItems.length > 0) groups.push({ label: 'Items', icon: '🎒', slots: regularItems })
    return groups.length >= 2 ? groups : null
  }, [sortedSlots, filterBy])

  const inspectSlot = useMemo(
    () => slots.find((slot) => slot.id === inspectSlotId) ?? null,
    [slots, inspectSlotId],
  )
  const inspectItem = useMemo(
    () => (inspectSlot?.kind === 'item' ? (LOOT_ITEMS.find((x) => x.id === inspectSlot.itemId) ?? null) : null),
    [inspectSlot],
  )
  const inspectRarity = useMemo(() => {
    if (inspectItem) return normalizeRarity(inspectItem.rarity)
    if (inspectSlot?.kind === 'chest' || inspectSlot?.kind === 'pending') {
      return normalizeRarity(CHEST_DEFS[inspectSlot.chestType].rarity)
    }
    return 'common'
  }, [inspectItem, inspectSlot])
  const inspectTheme = RARITY_THEME[inspectRarity]
  const equippedItems = useMemo(
    () =>
      LOOT_SLOTS
        .map((slot) => {
          const id = equippedBySlot[slot]
          if (!id) return null
          const item = LOOT_ITEMS.find((x) => x.id === id)
          if (!item) return null
          return { slot, item }
        })
        .filter((entry): entry is { slot: LootSlot; item: (typeof LOOT_ITEMS)[number] } => Boolean(entry)),
    [equippedBySlot],
  )
  const activeBuffs = useMemo(
    () =>
      equippedItems.map(({ slot, item }) => ({
        key: `${slot}:${item.id}`,
        slotLabel: SLOT_LABEL[slot],
        name: item.name,
        description: getItemPerkDescription(item),
        isGameplay: item.perkType !== 'cosmetic',
      })),
    [equippedItems],
  )

  useEffect(() => {
    ensureInventoryHydrated()
  }, [])

  useEffect(() => {
    if (inspectSlotId && !slots.some((slot) => slot.id === inspectSlotId)) setInspectSlotId(null)
  }, [slots, inspectSlotId])

  useEffect(() => {
    if (!openChestModal) return
    const hasMore =
      pendingRewards.some((r) => !r.claimed && r.chestType === openChestModal.chestType) || (chests[openChestModal.chestType] ?? 0) > 0
    if (chestModalAnimSeed > 1 && !hasMore) {
      setChestChainMessage('Oops, your bags are over')
      return
    }
    setChestChainMessage(null)
  }, [openChestModal, chestModalAnimSeed, pendingRewards, chests])

  useEffect(() => {
    const closeContext = () => setContextMenu(null)
    window.addEventListener('click', closeContext)
    return () => window.removeEventListener('click', closeContext)
  }, [])

  const openChest = (chestType: ChestType) => {
    const result = openChestAndGrantItem(chestType, { source: 'session_complete' })
    if (!result) return
    const seedZipTier = useFarmStore.getState().rollSeedDrop(chestType)
    setInspectSlotId(null)
    setContextMenu(null)
    setChestChainMessage(null)
    setChestModalAnimSeed((v) => v + 1)
    setOpenChestModal({ chestType, itemId: result.itemId, seedZipTier: seedZipTier ?? null, goldDropped: result.goldDropped })
  }

  const isPotionMaxed = (itemId: string) => {
    if (itemId === 'atk_potion') return permanentStats.atk >= POTION_MAX
    if (itemId === 'hp_potion') return permanentStats.hp >= POTION_MAX
    if (itemId === 'regen_potion') return permanentStats.hpRegen >= POTION_MAX
    return false
  }

  const runPrimaryAction = (slot: SlotEntry) => {
    if (slot.kind === 'pending') {
      const rewardId = slot.rewardIds[0]
      if (!rewardId) return
      claimPendingReward(rewardId)
      return openChest(slot.chestType)
    }
    if (slot.kind === 'chest') return openChest(slot.chestType)
    if (slot.kind === 'item') {
      const item = LOOT_ITEMS.find((x) => x.id === slot.itemId)
      if (!item) return
      if (item.slot === 'plant') return  // plants are not equippable
      if (item.slot === 'consumable') {
        if (isPotionMaxed(slot.itemId)) return
        const ok = consumePotion(slot.itemId)
        if (ok) playPotionSound()
        return
      }
      if (inBattle) {
        useNotificationStore.getState().push({ type: 'progression', icon: '⚔️', title: 'Combat active', body: 'Cannot change gear during a boss fight.' })
        return
      }
      if (slot.equipped) return unequipSlot(item.slot)
      return equipItem(slot.itemId)
    }
  }

  const runDeleteAction = (slot: SlotEntry) => {
    if (slot.kind === 'pending') {
      const rewardId = slot.rewardIds[0]
      if (!rewardId) return
      return deletePendingReward(rewardId)
    }
    if (slot.kind === 'chest') return deleteChest(slot.chestType)
    if (slot.kind === 'item') return deleteItem(slot.itemId)
  }

  const getPrimaryActionLabel = (slot: SlotEntry) => {
    if (slot.kind === 'pending') return 'Open'
    if (slot.kind === 'chest') return 'Open'
    if (slot.kind === 'item') {
      const item = LOOT_ITEMS.find((x) => x.id === slot.itemId)
      if (item?.slot === 'plant') return '—'
      if (item?.slot === 'consumable') return isPotionMaxed(slot.itemId) ? 'Maxed' : 'Drink'
      if (inBattle) return '⚔ Locked'
      return slot.equipped ? 'Unequip' : 'Equip'
    }
    return 'Open'
  }

  const hasNextChestToOpen = (chestType: ChestType) =>
    pendingRewards.some((r) => !r.claimed && r.chestType === chestType) || (chests[chestType] ?? 0) > 0

  const openNextChest = (chestType: ChestType) => {
    setChestChainMessage(null)
    const pending = pendingRewards.find((r) => !r.claimed && r.chestType === chestType)
    if (pending) {
      claimPendingReward(pending.id)
      const result = openChestAndGrantItem(chestType, { source: 'session_complete' })
      if (!result) return false
      const seedZipTier = useFarmStore.getState().rollSeedDrop(chestType)
      setChestModalAnimSeed((v) => v + 1)
      setOpenChestModal({ chestType, itemId: result.itemId, seedZipTier: seedZipTier ?? null, goldDropped: result.goldDropped })
      return true
    }
    if ((chests[chestType] ?? 0) > 0) {
      const result = openChestAndGrantItem(chestType, { source: 'session_complete' })
      if (!result) return false
      const seedZipTier = useFarmStore.getState().rollSeedDrop(chestType)
      setChestModalAnimSeed((v) => v + 1)
      setOpenChestModal({ chestType, itemId: result.itemId, seedZipTier: seedZipTier ?? null, goldDropped: result.goldDropped })
      return true
    }
    return false
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="p-4 pb-20 space-y-3"
    >
      <PageHeader title="Inventory" onBack={onBack} />

      <div className="rounded-xl border border-white/[0.09] bg-discord-card/80 p-3 space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono font-semibold">Character</p>
          {inBattle && <p className="text-[9px] text-amber-400/70 font-mono">⚔ locked in battle</p>}
        </div>

        {/* 3-column layout: gear rows | ring+weapon squares | stats */}
        {(() => {
          const renderRowSlot = (slot: LootSlot) => {
            const meta = SLOT_META[slot]
            const equippedItem = LOOT_ITEMS.find((item) => item.id === equippedBySlot[slot])
            const theme = equippedItem ? RARITY_THEME[normalizeRarity(equippedItem.rarity)] : null
            const row = (
              <div
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl border overflow-hidden h-full relative"
                style={theme
                  ? { borderColor: theme.border, background: `linear-gradient(100deg, ${theme.glow}20 0%, rgba(10,10,18,0.96) 50%)` }
                  : { borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(10,10,18,0.70)' }}
              >
                {/* Rarity accent bar */}
                <div className="w-[3px] rounded-full self-stretch flex-shrink-0" style={{ background: theme ? theme.color : 'rgba(255,255,255,0.07)', minHeight: 36 }} />
                {/* Item icon */}
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
                  style={theme
                    ? { background: `radial-gradient(circle at 50% 40%, ${theme.glow}55 0%, rgba(9,9,17,0.95) 65%)`, border: `1px solid ${theme.border}66` }
                    : { background: 'rgba(9,9,17,0.80)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  {equippedItem
                    ? <LootVisual icon={equippedItem.icon} image={equippedItem.image} className="w-6 h-6 object-contain" scale={equippedItem.renderScale ?? 1} />
                    : <span className="text-lg" style={{ opacity: 0.15 }}>{meta.icon}</span>}
                </div>
                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-mono uppercase tracking-widest leading-none" style={{ color: 'rgba(156,163,175,0.4)' }}>{meta.label}</p>
                  <p className={`text-[12px] font-semibold mt-1 truncate leading-tight ${equippedItem ? 'text-white' : 'italic'}`}
                    style={equippedItem ? undefined : { color: 'rgba(255,255,255,0.18)' }}>
                    {equippedItem ? equippedItem.name : 'empty'}
                  </p>
                </div>
                {/* Rarity dot */}
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: theme ? theme.color : 'rgba(255,255,255,0.08)', boxShadow: theme ? `0 0 6px ${theme.color}88` : 'none' }} />
              </div>
            )
            return (
              <BuffTooltip key={slot} item={equippedItem ?? null} placement="bottom" stretch>
                {equippedItem
                  ? <button type="button" onClick={() => { playClickSound(); setInspectSlotId(`item:${equippedItem.id}`) }} onContextMenu={(e) => { e.preventDefault(); unequipSlot(slot) }} className="w-full h-full text-left hover:brightness-110 active:scale-[0.99] transition-all">{row}</button>
                  : <div className="h-full">{row}</div>}
              </BuffTooltip>
            )
          }

          const renderSquareSlot = (slot: LootSlot) => {
            const meta = SLOT_META[slot]
            const equippedItem = LOOT_ITEMS.find((item) => item.id === equippedBySlot[slot])
            const theme = equippedItem ? RARITY_THEME[normalizeRarity(equippedItem.rarity)] : null
            const sq = (
              <div
                className="rounded-xl border overflow-hidden h-full"
                style={theme
                  ? { borderColor: theme.border, background: `linear-gradient(160deg, ${theme.glow}18 0%, rgba(10,10,18,0.96) 65%)` }
                  : { borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(10,10,18,0.70)' }}
              >
                <div className="flex flex-col items-center justify-center gap-1.5 w-full h-full py-2.5 px-2">
                  {/* Slot label above icon */}
                  <p className="text-[8px] font-mono uppercase tracking-widest leading-none" style={{ color: 'rgba(156,163,175,0.35)' }}>
                    {meta.label}
                  </p>
                  {/* Icon */}
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden"
                    style={theme
                      ? { background: `radial-gradient(circle at 50% 40%, ${theme.glow}60 0%, rgba(9,9,17,0.95) 70%)`, border: `1px solid ${theme.border}55` }
                      : { background: 'rgba(9,9,17,0.85)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    {equippedItem
                      ? <LootVisual icon={equippedItem.icon} image={equippedItem.image} className="w-6 h-6 object-contain" scale={equippedItem.renderScale ?? 1} />
                      : <span className="text-lg" style={{ opacity: 0.15 }}>{meta.icon}</span>}
                  </div>
                  {/* Item name or empty */}
                  <p className="text-[8px] font-mono leading-none text-center w-full truncate"
                    style={{ color: equippedItem ? 'rgba(255,255,255,0.70)' : 'rgba(156,163,175,0.3)' }}>
                    {equippedItem ? equippedItem.name : '—'}
                  </p>
                  {/* Rarity dot */}
                  {theme && <div className="w-1.5 h-1.5 rounded-full" style={{ background: theme.color, boxShadow: `0 0 5px ${theme.color}99` }} />}
                </div>
              </div>
            )
            return (
              <BuffTooltip key={slot} item={equippedItem ?? null} placement="bottom" stretch>
                {equippedItem
                  ? <button type="button" onClick={() => { playClickSound(); setInspectSlotId(`item:${equippedItem.id}`) }} onContextMenu={(e) => { e.preventDefault(); unequipSlot(slot) }} className="w-full h-full hover:brightness-110 transition-all">{sq}</button>
                  : <div className="h-full">{sq}</div>}
              </BuffTooltip>
            )
          }

          const stats = computePlayerStats(equippedBySlot, permanentStats)
          const ip = LOOT_SLOTS.reduce((sum, s) => {
            const id = equippedBySlot[s]; if (!id) return sum
            const it = LOOT_ITEMS.find((x) => x.id === id)
            return sum + (it ? getItemPower(it) : 0)
          }, 0)
          const statRows = [
            { icon: '⚔️', value: stats.atk,    label: 'ATK', unit: '/s', color: '#f87171', maxed: permanentStats.atk >= POTION_MAX },
            { icon: '❤️', value: stats.hp,      label: 'HP',  unit: '',   color: '#4ade80', maxed: permanentStats.hp >= POTION_MAX },
            { icon: '💧', value: stats.hpRegen, label: 'REG', unit: '/s', color: '#22d3ee', maxed: permanentStats.hpRegen >= POTION_MAX },
            { icon: '✨', value: ip,            label: 'IP',  unit: '',   color: '#fcd34d', maxed: false },
          ]

          return (
            <div className="space-y-2">
              {/* Gear: left column (head/body/legs) + right column (ring/weapon) */}
              <div className="flex gap-2">
                {/* Col 1: Head / Body / Legs */}
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  {(['head', 'body', 'legs'] as LootSlot[]).map((s) => (
                    <div key={s}>{renderRowSlot(s)}</div>
                  ))}
                </div>

                {/* Col 2: Ring (top, smaller) + Weapon (bottom, bigger) */}
                <div className="flex flex-col gap-1.5" style={{ width: 76 }}>
                  <div style={{ flex: 1 }}>{renderSquareSlot('ring')}</div>
                  <div style={{ flex: 2 }}>{renderSquareSlot('weapon')}</div>
                </div>
              </div>

              {/* Stats row — full width, 4 cards */}
              <div className="grid grid-cols-4 gap-1.5">
                {statRows.map(({ icon, value, label, unit, color, maxed }) => {
                  const c = maxed ? '#f59e0b' : color
                  return (
                    <div
                      key={label}
                      className="flex flex-col items-center justify-center gap-1 rounded-xl border py-3"
                      style={{ borderColor: `${c}22`, background: `linear-gradient(160deg, ${c}0d 0%, rgba(8,8,16,0.80) 70%)` }}
                    >
                      <span className="text-base leading-none">{icon}</span>
                      <span className="text-[17px] font-mono font-bold tabular-nums leading-none" style={{ color: c, textShadow: `0 0 10px ${c}66` }}>
                        {value}
                      </span>
                      <span className="text-[8px] font-mono uppercase tracking-widest leading-none" style={{ color: `${c}88` }}>
                        {label}{unit}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-discord-card/80 p-3 space-y-2.5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-widest text-gray-400 font-mono font-semibold shrink-0">
            Inventory
            <span className="ml-1.5 text-gray-500 normal-case tracking-normal font-normal">
              {sortedSlots.length}{sortedSlots.length !== slots.length ? `\u00a0/\u00a0${slots.length}` : ''}
            </span>
          </p>
          <div className="flex items-center gap-1 shrink-0">
            {/* View mode segmented control */}
            <div className="flex items-center rounded border border-white/[0.09] overflow-hidden">
              {(['list', 'grid', 'compact'] as const).map((mode, i) => {
                const labels = ['≡ List', '⊞ Grid', '⊟ Mini'] as const
                const active = viewMode === mode
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={`text-[8px] font-mono px-1.5 py-0.5 transition-colors ${i > 0 ? 'border-l border-white/[0.07]' : ''} ${
                      active ? 'text-cyber-neon bg-cyber-neon/10' : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {labels[i]}
                  </button>
                )
              })}
            </div>
            {/* Sort cycle button */}
            <button
              type="button"
              onClick={() => setSortBy((s) => s === 'rarity' ? 'name' : s === 'name' ? 'slot' : 'rarity')}
              className="text-[9px] font-mono px-2 py-0.5 rounded border border-white/[0.07] text-gray-500 hover:text-gray-300 hover:border-white/15 transition-colors"
            >
              {sortBy === 'rarity' ? '▼ Rarity' : sortBy === 'name' ? '▼ A–Z' : '▼ Slot'}
            </button>
          </div>
        </div>

        {/* Filter pills — single scrollable row */}
        <div className="relative overflow-hidden">
          <div
            className="flex gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {FILTERS.map((f) => {
              const active = filterBy === f.id
              const count = filterCounts[f.id] ?? 0
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => { playClickSound(); setFilterBy(f.id) }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[9px] font-medium transition-all flex-shrink-0 ${
                    active
                      ? 'border-cyber-neon/40 bg-cyber-neon/10 text-cyber-neon'
                      : 'border-white/[0.08] bg-discord-darker/30 text-gray-400 hover:text-gray-200 hover:border-white/20'
                  }`}
                >
                  <span className="text-[10px] leading-none">{f.icon}</span>
                  <span>{f.label}</span>
                  {!active && count > 0 && (
                    <span className="ml-0.5 text-[8px] font-mono opacity-50">{count}</span>
                  )}
                </button>
              )
            })}
          </div>
          {/* Right fade mask */}
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-discord-card/80 to-transparent" />
        </div>

        {/* Divider */}
        <div className="border-t border-white/[0.05]" />

        {/* Items */}
        {slots.length === 0 ? (
          <p className="text-[11px] text-gray-500 py-2">No loot yet.</p>
        ) : sortedSlots.length === 0 ? (
          <p className="text-[11px] text-gray-500 py-2">Nothing here.</p>
        ) : (() => {
          const renderCard = (slot: SlotEntry) => {
            const slotRarity = getSlotRarity(slot)
            const slotTheme = RARITY_THEME[normalizeRarity(slotRarity)]
            const isEquipped = slot.kind === 'item' && slot.equipped
            const isPending = slot.kind === 'pending'
            const lootItem = slot.kind === 'item' ? LOOT_ITEMS.find((x) => x.id === slot.itemId) : null
            const perkChip = lootItem && lootItem.perkType !== 'cosmetic' && lootItem.slot !== 'consumable' && lootItem.slot !== 'plant'
              ? getItemPerkDescription(lootItem)
              : null
            const rarityNorm = normalizeRarity(slotRarity)
            const typeLabel = slot.kind === 'chest' || slot.kind === 'pending'
              ? (isPending ? 'INBOX' : 'BAG')
              : lootItem?.slot === 'consumable' ? 'POTION'
              : lootItem?.slot === 'plant' ? 'PLANT'
              : lootItem ? SLOT_LABEL[lootItem.slot]
              : '?'
            const cardStyle = {
              borderColor: isEquipped ? `${slotTheme.color}CC` : `${slotTheme.color}55`,
              background: isEquipped
                ? `linear-gradient(160deg, ${slotTheme.glow}22 0%, rgba(12,12,20,0.95) 60%)`
                : `linear-gradient(160deg, ${slotTheme.glow}10 0%, rgba(12,12,20,0.92) 65%)`,
            }
            const onClickCard = () => { playClickSound(); setInspectSlotId(slot.id); setContextMenu(null) }
            const onRightClick = (e: React.MouseEvent) => {
              e.preventDefault()
              setContextMenu({ x: Math.min(e.clientX, window.innerWidth - 168), y: Math.min(e.clientY, window.innerHeight - 128), slotId: slot.id })
            }

            if (viewMode === 'list') {
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={onClickCard}
                  onContextMenu={onRightClick}
                  className="relative w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg border hover:brightness-110 active:scale-[0.99] transition-all text-left overflow-hidden"
                  style={cardStyle}
                >
                  {isPending && <span className="absolute inset-0 rounded-lg pointer-events-none animate-pulse border border-amber-400/30" />}
                  {/* Left rarity bar */}
                  <div className="w-[3px] self-stretch rounded-full flex-shrink-0" style={{ background: slotTheme.color }} />
                  {/* Icon */}
                  <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden relative" style={{ background: 'rgba(9,9,17,0.85)' }}>
                    <LootVisual icon={slot.icon} image={slot.image} className="w-6 h-6 object-contain" scale={lootItem?.renderScale ?? 1} />
                    {isEquipped && <span className="absolute bottom-0 right-0 text-[6px] font-bold font-mono px-0.5 rounded-tl leading-tight" style={{ background: slotTheme.color, color: '#000' }}>EQ</span>}
                  </div>
                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[11px] font-semibold text-white truncate">{slot.title}</p>
                      {typeLabel && <span className="text-[7px] font-mono uppercase px-1 py-px rounded border border-white/10 text-gray-500 flex-shrink-0">{typeLabel}</span>}
                    </div>
                    <p className="text-[9px] text-gray-400 truncate mt-0.5">{perkChip ?? rarityNorm}</p>
                  </div>
                  {/* Right: qty + dot */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {slot.quantity > 1 && <span className="text-[9px] font-mono" style={{ color: slotTheme.color }}>×{slot.quantity}</span>}
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: slotTheme.color }} />
                  </div>
                </button>
              )
            }

            if (viewMode === 'compact') {
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={onClickCard}
                  onContextMenu={onRightClick}
                  className="relative flex flex-col items-center gap-1 p-1.5 rounded-lg border hover:brightness-110 active:scale-[0.97] transition-all overflow-hidden"
                  style={cardStyle}
                >
                  {isPending && <span className="absolute inset-0 rounded-lg pointer-events-none animate-pulse border border-amber-400/30" />}
                  {slot.quantity > 1 && (
                    <span
                      className="absolute top-1 right-1 text-[8px] font-bold font-mono leading-none px-0.5 rounded z-10"
                      style={{ background: `${slotTheme.color}44`, color: slotTheme.color }}
                    >×{slot.quantity}</span>
                  )}
                  <div className="w-9 h-9 rounded-md flex items-center justify-center overflow-hidden relative" style={{ background: 'rgba(9,9,17,0.85)' }}>
                    <LootVisual icon={slot.icon} image={slot.image} className="w-6 h-6 object-contain" scale={lootItem?.renderScale ?? 1} />
                    {isEquipped && <span className="absolute bottom-0 right-0 text-[6px] font-bold font-mono px-0.5 rounded-tl leading-tight" style={{ background: slotTheme.color, color: '#000' }}>EQ</span>}
                  </div>
                  <p className="text-[9px] font-semibold text-white leading-tight w-full truncate text-center">{slot.title}</p>
                  {/* Bottom rarity bar */}
                  <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: slotTheme.color, opacity: rarityNorm === 'common' ? 0.6 : 1 }} />
                </button>
              )
            }

            // grid (2-col) mode
            return (
              <button
                key={slot.id}
                type="button"
                onClick={onClickCard}
                onContextMenu={onRightClick}
                className="relative flex flex-col gap-1.5 p-2 rounded-lg border hover:brightness-110 active:scale-[0.98] transition-all text-left overflow-hidden"
                style={cardStyle}
              >
                {isPending && (
                  <span className="absolute inset-0 rounded-lg pointer-events-none animate-pulse border border-amber-400/30" />
                )}
                {/* Top row: type chip + qty */}
                <div className="flex items-center justify-between gap-1">
                  <span
                    className="text-[8px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 rounded leading-none"
                    style={{ background: isPending ? 'rgba(251,191,36,0.18)' : `${slotTheme.color}22`, color: isPending ? '#fbbf24' : slotTheme.color }}
                  >
                    {typeLabel}
                  </span>
                  <span
                    className="text-[9px] font-bold font-mono leading-none px-1 py-0.5 rounded"
                    style={{
                      background: slot.quantity > 1 ? `${slotTheme.color}33` : 'rgba(255,255,255,0.05)',
                      color: slot.quantity > 1 ? slotTheme.color : 'rgba(255,255,255,0.2)',
                    }}
                  >
                    ×{slot.quantity}
                  </span>
                </div>
                {/* Icon box */}
                <div className="flex justify-center">
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden relative"
                    style={isEquipped
                      ? { background: `radial-gradient(circle at 50% 40%, ${slotTheme.glow}55 0%, rgba(9,9,17,0.95) 70%)` }
                      : { background: 'rgba(9,9,17,0.85)' }}
                  >
                    <LootVisual icon={slot.icon} image={slot.image} className="w-7 h-7 object-contain" scale={lootItem?.renderScale ?? 1} />
                    {isEquipped && (
                      <span className="absolute bottom-0 right-0 text-[7px] font-bold font-mono px-0.5 rounded-tl rounded-br leading-tight" style={{ background: slotTheme.color, color: '#000' }}>EQ</span>
                    )}
                  </div>
                </div>
                {/* Name */}
                <p className="text-[11px] font-semibold text-white leading-tight w-full truncate">{slot.title}</p>
                {/* Perk chip */}
                {perkChip && (
                  <span className="text-[9px] font-mono font-semibold leading-none truncate" style={{ color: slotTheme.color }}>{perkChip}</span>
                )}
                {/* Bottom rarity bar */}
                <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: slotTheme.color, opacity: rarityNorm === 'common' ? 0.6 : 1 }} />
              </button>
            )
          }

          const gridClass = viewMode === 'list' ? 'flex flex-col gap-0.5' : viewMode === 'compact' ? 'grid grid-cols-3 gap-1' : 'grid grid-cols-2 gap-1.5'
          const sectionHdrClass = `${viewMode !== 'list' ? 'col-span-full' : ''} text-[9px] font-mono uppercase tracking-widest text-gray-500 pt-1 pb-0.5 flex items-center gap-2`

          if (groupedSlots) {
            return (
              <div className={gridClass}>
                {groupedSlots.map(({ label, icon, slots: grpSlots }) => (
                  <React.Fragment key={label}>
                    <div className={sectionHdrClass}>
                      <span className="flex items-center gap-1.5">
                        {icon === '📥' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />}
                        {icon} {label}
                      </span>
                      <div className="flex-1 border-t border-white/[0.05]" />
                      <span>{grpSlots.length}</span>
                    </div>
                    {grpSlots.map(renderCard)}
                  </React.Fragment>
                ))}
              </div>
            )
          }

          return <div className={gridClass}>{sortedSlots.map(renderCard)}</div>
        })()}
      </div>

      {inspectSlot &&
        typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[85] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setInspectSlotId(null)}
            >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 8 }}
              className="w-[320px] rounded-xl border p-4 relative overflow-hidden"
              style={{
                borderColor: inspectTheme.border,
                background: inspectTheme.panel,
                boxShadow: `0 0 24px ${inspectTheme.glow}`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <motion.div
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(circle at 50% 18%, ${inspectTheme.glow} 0%, transparent 58%)` }}
                initial={{ opacity: 0.35, scale: 0.98 }}
                animate={{ opacity: [0.3, 0.55, 0.35], scale: [0.98, 1.02, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="h-10 flex items-center">
                    <LootVisual
                      icon={inspectSlot.icon}
                      image={inspectSlot.image}
                      className="w-12 h-12 object-contain"
                      scale={inspectItem?.renderScale ?? 1}
                    />
                  </div>
                  <p className="text-sm text-white font-semibold mt-1">{inspectSlot.title}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{inspectSlot.subtitle}</p>
                </div>
                <p className="text-[10px] text-gray-500 font-mono">qty x{inspectSlot.quantity}</p>
              </div>
              {/* Pills: rarity + slot + equipped */}
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span
                  className="text-[9px] px-2 py-0.5 rounded border font-mono uppercase"
                  style={{ color: inspectTheme.color, borderColor: inspectTheme.border, background: `${inspectTheme.color}1a` }}
                >
                  {inspectRarity}
                </span>
                {inspectItem && (
                  <span className="text-[9px] px-2 py-0.5 rounded border border-white/15 text-gray-400 font-mono uppercase">
                    {SLOT_LABEL[inspectItem.slot]}
                  </span>
                )}
                {(inspectSlot.kind === 'chest' || inspectSlot.kind === 'pending') && (
                  <span className="text-[9px] px-2 py-0.5 rounded border border-white/15 text-gray-400 font-mono uppercase">
                    {inspectSlot.kind === 'pending' ? 'Inbox' : 'Bag'}
                  </span>
                )}
                {inspectSlot.kind === 'item' && inspectSlot.equipped && (
                  <span className="text-[9px] px-2 py-0.5 rounded border border-cyber-neon/40 text-cyber-neon font-mono">
                    equipped
                  </span>
                )}
              </div>
              <div className="mt-3 rounded-lg border border-white/10 bg-discord-darker/40 p-2.5 space-y-1">
                {inspectSlot.kind === 'item' && (() => {
                  if (!inspectItem) return <p className="text-[10px] text-gray-500">Unknown item.</p>
                  const isPlant = inspectItem.slot === 'plant'
                  const isPotion = (POTION_IDS as readonly string[]).includes(inspectItem.id)
                  const consumed = isPotion
                    ? inspectItem.id === 'atk_potion' ? permanentStats.atk
                      : inspectItem.id === 'hp_potion' ? permanentStats.hp
                      : permanentStats.hpRegen
                    : 0
                  const rate = estimateLootDropRate(inspectItem.id, { source: 'skill_grind', focusCategory: 'coding' })
                  return (
                    <>
                      {isPlant && (
                        <p className="text-[10px] text-lime-400/80 font-mono">🌾 Farm harvest · sell on Marketplace</p>
                      )}
                      {!isPotion && !isPlant && <p className="text-[10px] text-gray-300"><span className="text-gray-500">Drop rate:</span> ~{rate}%</p>}
                      <p className="text-[10px] text-gray-300"><span className="text-gray-500">Effect:</span> {getItemPerkDescription(inspectItem)}</p>
                      {isPotion && (
                        <p className={`text-[10px] font-mono ${consumed >= POTION_MAX ? 'text-amber-400' : 'text-gray-400'}`}>
                          Consumed: {consumed}/{POTION_MAX}{consumed >= POTION_MAX ? ' — MAXED' : ''}
                        </p>
                      )}
                    </>
                  )
                })()}
                {inspectSlot.kind === 'chest' && (
                  <p className="text-[10px] text-gray-300">Bag can be opened to roll a random item.</p>
                )}
                {inspectSlot.kind === 'pending' && (
                  <p className="text-[10px] text-gray-300">Pending drop from activity. Claim it first.</p>
                )}
              </div>
              <div className="mt-3 flex gap-2 flex-wrap">
                {(() => {
                  const isPlant = inspectSlot.kind === 'item' && LOOT_ITEMS.find((x) => x.id === inspectSlot.itemId)?.slot === 'plant'
                  const isConsumable = inspectSlot.kind === 'item' && LOOT_ITEMS.find((x) => x.id === inspectSlot.itemId)?.slot === 'consumable'
                  const isMaxed = isConsumable && isPotionMaxed(inspectSlot.kind === 'item' ? inspectSlot.itemId : '')
                  const isGearLocked = inBattle && inspectSlot.kind === 'item' && !isConsumable
                  const disabled = isPlant || isMaxed
                  return (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        playClickSound()
                        runPrimaryAction(inspectSlot)
                      }}
                      className={`flex-1 min-w-0 text-[10px] py-1.5 rounded border font-semibold transition-colors ${
                        disabled || isGearLocked ? 'border-white/10 text-gray-600 cursor-not-allowed' : ''
                      }`}
                      style={disabled || isGearLocked ? undefined : { color: inspectTheme.color, borderColor: inspectTheme.border, backgroundColor: `${inspectTheme.color}22` }}
                    >
                      {getPrimaryActionLabel(inspectSlot)}
                    </button>
                  )
                })()}
                {inspectSlot.kind === 'item' && !inspectSlot.equipped && !MARKETPLACE_BLOCKED_ITEMS.includes(inspectSlot.itemId) && (
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound()
                      setListForSaleTarget(inspectSlot.itemId)
                      setInspectSlotId(null)
                    }}
                    className="flex-1 min-w-0 text-[10px] py-1.5 rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/15 font-semibold"
                  >
                    List for sale
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    playClickSound()
                    runDeleteAction(inspectSlot)
                  }}
                  className="flex-1 min-w-0 text-[10px] py-1.5 rounded border border-red-400/35 text-red-300 hover:bg-red-400/10"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
          </AnimatePresence>,
          document.body
        )}

      <AnimatePresence>
        {contextMenu && (() => {
          const slot = slots.find((x) => x.id === contextMenu.slotId)
          if (!slot) return null
          return (
            <div
              className="fixed z-[90] w-[156px] rounded-lg border border-white/15 bg-discord-card shadow-xl px-1.5 py-1.5"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={(e) => e.stopPropagation()}
            >
              {(() => {
                const isPlant = slot.kind === 'item' && LOOT_ITEMS.find((x) => x.id === slot.itemId)?.slot === 'plant'
                const isConsumable = slot.kind === 'item' && LOOT_ITEMS.find((x) => x.id === slot.itemId)?.slot === 'consumable'
                const isMaxed = isConsumable && isPotionMaxed(slot.kind === 'item' ? slot.itemId : '')
                const isGearLocked = inBattle && slot.kind === 'item' && !isConsumable
                const disabled = isPlant || isMaxed
                return (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      playClickSound()
                      runPrimaryAction(slot)
                      if (!isGearLocked) setContextMenu(null)
                    }}
                    className={`block w-full text-left text-[11px] px-2 py-1 rounded ${
                      disabled || isGearLocked ? 'text-gray-600 cursor-not-allowed' : 'text-cyber-neon hover:bg-cyber-neon/15'
                    }`}
                  >
                    {getPrimaryActionLabel(slot)}
                  </button>
                )
              })()}
              {slot.kind === 'item' && !slot.equipped && !MARKETPLACE_BLOCKED_ITEMS.includes(slot.itemId) && (
                <button
                  type="button"
                  onClick={() => {
                    playClickSound()
                    setListForSaleTarget(slot.itemId)
                    setContextMenu(null)
                  }}
                  className="block w-full text-left text-[11px] px-2 py-1 rounded text-amber-300 hover:bg-amber-500/15"
                >
                  List for sale
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  playClickSound()
                  runDeleteAction(slot)
                  setContextMenu(null)
                }}
                className="block w-full text-left text-[11px] px-2 py-1 rounded text-red-300 hover:bg-red-400/10"
              >
                Delete
              </button>
            </div>
          )
        })()}
      </AnimatePresence>

      <AnimatePresence>
        {listForSaleTarget && (
          <ListForSaleModal
            itemId={listForSaleTarget}
            maxQty={useInventoryStore.getState().items[listForSaleTarget] ?? 1}
            onClose={() => setListForSaleTarget(null)}
            onListed={async () => {
              const { items, chests } = useInventoryStore.getState()
              const { seeds, seedZips } = useFarmStore.getState()
              await syncInventoryToSupabase(items, chests, { merge: false, seeds, seedZips }).catch(() => {})
              setListForSaleTarget(null)
            }}
          />
        )}
      </AnimatePresence>

      <ChestOpenModal
        open={Boolean(openChestModal)}
        chestType={openChestModal?.chestType ?? null}
        item={openChestModal ? (LOOT_ITEMS.find((x) => x.id === openChestModal.itemId) ?? null) : null}
        goldDropped={openChestModal?.goldDropped}
        seedZipTier={openChestModal?.seedZipTier}
        onClose={() => {
          setOpenChestModal(null)
          setChestChainMessage(null)
        }}
        nextAvailable={openChestModal ? hasNextChestToOpen(openChestModal.chestType) : false}
        chainMessage={chestChainMessage}
        animationSeed={chestModalAnimSeed}
        onOpenNext={() => {
          if (!openChestModal) return
          const opened = openNextChest(openChestModal.chestType)
          if (!opened) {
            setChestChainMessage('Oops, your bags are over')
          }
        }}
      />
    </motion.div>
  )
}
