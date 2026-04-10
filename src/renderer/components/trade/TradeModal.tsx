import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useTradeStore, type TradeItem, type TradeOffer } from '../../stores/tradeStore'
import { useInventoryStore } from '../../stores/inventoryStore'
import { useGoldStore } from '../../stores/goldStore'
import { LOOT_ITEMS, getItemPerkDescription, getItemPerks, getItemPower, ITEM_POWER_BY_RARITY, estimateLootDropRate } from '../../lib/loot'
import { CRAFT_ITEM_MAP } from '../../lib/crafting'
import type { FriendProfile } from '../../hooks/useFriends'
import { AvatarWithFrame } from '../shared/AvatarWithFrame'
import { useToastStore } from '../../stores/toastStore'
import { LootVisual, RARITY_THEME, normalizeRarity, SLOT_LABEL } from '../loot/LootUI'

async function refreshInventory(userId: string) {
  if (!supabase) return
  const { data } = await supabase
    .from('user_inventory')
    .select('item_id, quantity')
    .eq('user_id', userId)
    .gt('quantity', 0)
  if (data) {
    useInventoryStore.getState().syncItemsFromCloud(data.map((r) => ({ item_id: r.item_id, quantity: r.quantity })))
  }
}

function findTradeDef(id: string) {
  return LOOT_ITEMS.find((i) => i.id === id) ?? CRAFT_ITEM_MAP[id] ?? null
}

// ─── Item inspect popup ────────────────────────────────────────────────────────

export function TradeItemInspectPopup({ itemId, qty, onClose }: { itemId: string; qty: number; onClose: () => void }) {
  const def = findTradeDef(itemId)
  if (!def) return null
  const rarity = normalizeRarity(def.rarity)
  const theme = RARITY_THEME[rarity]

  // Build perk stat cards identical to inventory detail view
  type PerkDisplay = { value: string; unit: string; desc: string; color: string }
  const perkDisplays: PerkDisplay[] = getItemPerks(def as Parameters<typeof getItemPerks>[0]).flatMap((p): PerkDisplay[] => {
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
      case 'streak_shield':    return [{ value: '1×',    unit: 'Shield',  desc: 'Streak protect',        color: '#f97316' }]
      case 'status_title':     return [{ value: '✦',     unit: String(p.perkValue || 'Title'), desc: 'Status title', color: theme.color }]
      default: return []
    }
  })

  const ip = getItemPower(def as Parameters<typeof getItemPower>[0])
  const baseWt = ITEM_POWER_BY_RARITY[def.rarity] ?? 100
  const isEquipSlot = (['head', 'body', 'legs', 'ring', 'weapon'] as const).includes(def.slot as never)
  const rate = isEquipSlot ? estimateLootDropRate(def.id, { source: 'skill_grind', focusCategory: 'coding' }) : null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="trade-inspect-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(3px)' }}
        onClick={onClose}
      >
        <motion.div
          key="trade-inspect-panel"
          initial={{ scale: 0.92, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 5 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className="w-full max-w-[360px] rounded border overflow-hidden flex relative"
          style={{
            borderColor: theme.border,
            background: 'rgba(8,8,16,0.98)',
            boxShadow: `0 0 36px ${theme.glow}55, 0 8px 28px rgba(0,0,0,0.75)`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Left — icon art (identical to inventory) */}
          <div
            className="relative flex-shrink-0 flex flex-col items-center justify-center gap-2 py-4"
            style={{
              width: 100,
              background: `radial-gradient(ellipse at 50% 42%, ${theme.glow}55 0%, ${theme.glow}18 44%, rgba(5,5,12,0.97) 76%)`,
              borderRight: `1px solid ${theme.border}55`,
            }}
          >
            <motion.div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{ background: `radial-gradient(circle at 50% 44%, ${theme.glow}28 0%, transparent 64%)` }}
              animate={{ opacity: [0.5, 0.85, 0.5] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div className="relative z-10" style={{ width: 80, height: 80 }}>
              <LootVisual
                icon={def.icon}
                image={(def as { image?: string }).image}
                className="w-full h-full object-contain drop-shadow-lg"
                scale={(def as { renderScale?: number }).renderScale ?? 1 * 1.3}
              />
            </div>
            <div className="relative z-10 px-2 py-0.5 rounded-full border text-[9px] font-mono font-bold uppercase tracking-widest"
              style={{ color: theme.color, borderColor: `${theme.border}99`, background: `${theme.color}18` }}>
              {rarity}
            </div>
            {qty > 1 && (
              <p className="relative z-10 text-[9px] font-mono mt-0.5" style={{ color: `${theme.color}99` }}>×{qty}</p>
            )}
          </div>

          {/* Right — details (identical to inventory) */}
          <div className="flex-1 min-w-0 flex flex-col p-3.5 gap-0">
            <button type="button" onClick={onClose}
              className="absolute top-2.5 right-2.5 w-6 h-6 flex items-center justify-center rounded-full text-gray-500 hover:text-white hover:bg-white/10 transition-colors text-sm leading-none z-20">×</button>

            {/* Name + slot pill */}
            <div className="pr-6">
              <p className="text-sm font-bold text-white leading-tight">{def.name}</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className="text-[9px] px-1.5 py-0.5 rounded border border-white/15 text-gray-400 font-mono uppercase tracking-wide">
                  {SLOT_LABEL[def.slot] ?? def.slot}
                </span>
              </div>
            </div>

            {/* Flavor */}
            {def.description && (
              <p className="text-[10px] text-gray-400 italic mt-1.5 leading-snug">{def.description}</p>
            )}

            {/* Perk stat cards — same grid as inventory */}
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
                        <span className="text-[9px] font-mono font-semibold" style={{ color: `${pd.color}cc` }}>{pd.unit}</span>
                      </div>
                      <span className="text-[9px] text-gray-400 capitalize leading-none">{pd.desc}</span>
                    </div>
                  ))}
                </div>
              )}

              {perkDisplays.length === 0 && def.perkType !== 'cosmetic' && (
                <p className="text-[10px] text-gray-500 italic">{getItemPerkDescription(def as Parameters<typeof getItemPerkDescription>[0])}</p>
              )}
              {(def as { perkType?: string }).perkType === 'cosmetic' && (
                <p className="text-[10px] text-gray-400">Visual cosmetic — no gameplay effect.</p>
              )}

              {/* IP · Wt · drop rate footer */}
              {isEquipSlot && (
                <div className="flex items-center gap-2 text-[9px] font-mono pt-0.5 border-t border-white/[0.05]">
                  <span className="text-gray-500">IP</span>
                  <span style={{ color: theme.color }}>{ip}</span>
                  <span className="text-white/20">·</span>
                  <span className="text-gray-500">Wt</span>
                  <span className="text-gray-300">{baseWt}</span>
                  {rate !== null && <>
                    <span className="text-white/20">·</span>
                    <span className="text-gray-500">~{rate}% drop</span>
                  </>}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const RARITY_COLOR: Record<string, string> = {
  common: 'text-gray-300',
  rare: 'text-blue-400',
  epic: 'text-purple-400',
  legendary: 'text-amber-400',
  mythic: 'text-rose-400',
}

const RARITY_BORDER: Record<string, string> = {
  common: 'border-gray-500/40',
  rare: 'border-blue-500/40',
  epic: 'border-purple-500/40',
  legendary: 'border-amber-500/40',
  mythic: 'border-rose-500/40',
}

const RARITY_BG: Record<string, string> = {
  common: 'bg-gray-500/10',
  rare: 'bg-blue-500/10',
  epic: 'bg-purple-500/10',
  legendary: 'bg-amber-500/10',
  mythic: 'bg-rose-500/10',
}

function useCountdown(expiresAt: string | null) {
  const [secs, setSecs] = useState(() =>
    expiresAt ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)) : 0
  )
  useEffect(() => {
    if (!expiresAt) return
    const t = setInterval(() => {
      const left = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
      setSecs(left)
    }, 1000)
    return () => clearInterval(t)
  }, [expiresAt])
  if (secs <= 0) return 'Expired'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

// ─── Item Slot display ─────────────────────────────────────────────────────────

function ItemSlot({
  itemId, qty, onRemove, onInspect,
}: {
  itemId: string
  qty: number
  onRemove?: () => void
  onInspect?: (id: string) => void
}) {
  const def = findTradeDef(itemId)
  if (!def) return null
  const rColor = RARITY_COLOR[def.rarity] ?? 'text-gray-300'
  const rBorder = RARITY_BORDER[def.rarity] ?? 'border-gray-500/40'
  const rBg = RARITY_BG[def.rarity] ?? 'bg-gray-500/10'
  return (
    <div className={`relative flex items-center gap-2 rounded border px-2 py-1.5 ${rBg} ${rBorder}`}>
      <button
        type="button"
        title="Inspect item"
        onClick={(e) => { e.stopPropagation(); onInspect?.(itemId) }}
        className={`w-8 h-8 rounded flex items-center justify-center shrink-0 border ${rBorder} bg-black/20 transition-opacity ${onInspect ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
      >
        <LootVisual icon={def.icon} image={(def as { image?: string }).image} className="w-5 h-5 object-contain" scale={(def as { renderScale?: number }).renderScale ?? 1} />
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold truncate ${rColor}`}>{def.name}</p>
        <p className="text-[10px] text-gray-500 font-mono capitalize">{def.rarity} · ×{qty}</p>
      </div>
      {onRemove && (
        <button type="button" onClick={onRemove}
          className="shrink-0 text-gray-600 hover:text-red-400 transition-colors p-0.5">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

// ─── Item Picker ───────────────────────────────────────────────────────────────

// ─── Inline trade column — always-visible picker ─────────────────────────────

function TradeColumn({
  title,
  emptyHint,
  items,
  inventory,
  onAdd,
  onRemove,
  onInspect,
}: {
  title: string
  emptyHint: string
  items: TradeItem[]
  inventory: Array<{ item_id: string; qty: number }>
  onAdd: (itemId: string, qty: number) => void
  onRemove: (itemId: string) => void
  onInspect?: (id: string) => void
}) {
  const [filter, setFilter] = useState('')
  const [qtyInput, setQtyInput] = useState<Record<string, string>>({})

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return inventory.filter((row) => {
      const def = findTradeDef(row.item_id)
      if (!def) return false
      if (q && !def.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [inventory, filter])

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{title}</span>

      {/* Selected items */}
      {items.length > 0 && (
        <div className="space-y-1">
          {items.map((t) => (
            <ItemSlot key={t.item_id} itemId={t.item_id} qty={t.qty}
              onRemove={() => onRemove(t.item_id)}
              onInspect={onInspect} />
          ))}
        </div>
      )}

      {/* Filter + scrollable picker */}
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search..."
        className="w-full bg-surface-1 border border-white/[0.08] rounded px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-accent/40"
      />
      <div className="flex-1 overflow-y-auto space-y-0.5 max-h-[160px] pr-0.5">
        {inventory.length === 0 ? (
          <p className="text-center text-[10px] text-gray-600 py-6">{emptyHint}</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-[10px] text-gray-600 py-4">No matches</p>
        ) : (
          filtered.map(({ item_id, qty: maxQty }) => {
            const def = findTradeDef(item_id)
            if (!def) return null
            const sel = items.find((s) => s.item_id === item_id)
            const rColor = RARITY_COLOR[def.rarity] ?? 'text-gray-300'
            const rBorder = RARITY_BORDER[def.rarity] ?? 'border-gray-500/40'
            const rawInput = qtyInput[item_id] ?? String(sel?.qty ?? 1)
            const pickedQty = Math.max(1, Math.min(maxQty, parseInt(rawInput, 10) || 1))

            return (
              <div key={item_id}
                className={`flex items-center gap-1.5 rounded border px-1.5 py-1 cursor-pointer transition-all ${
                  sel ? `${rBorder} bg-accent/[0.07]` : 'border-white/[0.05] bg-surface-2/30 hover:border-white/10'
                }`}
                onClick={() => {
                  if (sel) onRemove(item_id)
                  else onAdd(item_id, pickedQty)
                }}
              >
                <button
                  type="button"
                  title="Inspect"
                  onClick={(e) => { e.stopPropagation(); onInspect?.(item_id) }}
                  className={`w-6 h-6 rounded flex items-center justify-center shrink-0 border ${rBorder} bg-black/20 ${onInspect ? 'hover:opacity-75' : ''}`}
                >
                  <LootVisual icon={def.icon} image={(def as { image?: string }).image} className="w-4 h-4 object-contain" scale={(def as { renderScale?: number }).renderScale ?? 1} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-[10px] font-semibold truncate ${rColor}`}>{def.name}</p>
                  <p className="text-[9px] text-gray-600 font-mono">×{maxQty}</p>
                </div>
                {sel && (
                  <input
                    type="number" min={1} max={maxQty}
                    value={rawInput}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const v = e.target.value
                      setQtyInput((p) => ({ ...p, [item_id]: v }))
                      const n = Math.max(1, Math.min(maxQty, parseInt(v, 10) || 1))
                      onAdd(item_id, n)
                    }}
                    className="w-10 bg-surface-1 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white text-center focus:outline-none shrink-0"
                  />
                )}
                {sel
                  ? <span className="text-[9px] text-accent font-mono shrink-0">✓</span>
                  : <span className="text-[9px] text-gray-700 shrink-0">+</span>
                }
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Create mode ──────────────────────────────────────────────────────────────

function CreateTrade({ recipient }: { recipient: FriendProfile }) {
  const { user } = useAuthStore()
  const closeModal = useTradeStore((s) => s.closeModal)
  const setOutgoingOffer = useTradeStore((s) => s.setOutgoingOffer)
  const pushToast = useToastStore((s) => s.push)
  const localItems = useInventoryStore((s) => s.items)
  const myGoldBalance = useGoldStore((s) => s.gold)

  const [offerItems, setOfferItems] = useState<TradeItem[]>([])
  const [wantItems, setWantItems] = useState<TradeItem[]>([])
  const [offerGold, setOfferGold] = useState(0)
  const [wantGold, setWantGold] = useState(0)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [inspectId, setInspectId] = useState<{ id: string; qty: number } | null>(null)

  // My inventory from Supabase (source of truth for trades)
  const [myInv, setMyInv] = useState<Array<{ item_id: string; qty: number }>>([])
  const [recipientInv, setRecipientInv] = useState<Array<{ item_id: string; qty: number }>>([])

  useEffect(() => {
    if (!supabase || !user) return
    ;(async () => {
      const [mine, theirs] = await Promise.all([
        // Use quantity - reserved_qty so picker shows only what's actually available to offer
        supabase.from('user_inventory').select('item_id, quantity, reserved_qty').eq('user_id', user.id).gt('quantity', 0),
        supabase.from('user_inventory').select('item_id, quantity').eq('user_id', recipient.id).gt('quantity', 0),
      ])
      // Merge with local store as fallback (items may not be synced to Supabase yet)
      const supabaseIds = new Set((mine.data || []).map((r) => r.item_id))
      const localFallback = Object.entries(localItems)
        .filter(([id, qty]) => qty > 0 && !supabaseIds.has(id))
        .map(([item_id, quantity]) => ({ item_id, qty: quantity }))
      const merged = [
        ...(mine.data || [])
          .map((r) => ({ item_id: r.item_id, qty: r.quantity - (r.reserved_qty ?? 0) }))
          .filter((r) => r.qty > 0),
        ...localFallback,
      ]
      setMyInv(merged)
      setRecipientInv((theirs.data || []).map((r) => ({ item_id: r.item_id, qty: r.quantity })))
    })()
  }, [user, recipient.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const addOffer = useCallback((itemId: string, qty: number) => {
    setOfferItems((prev) => {
      const idx = prev.findIndex((i) => i.item_id === itemId)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = { item_id: itemId, qty }; return next
      }
      return [...prev, { item_id: itemId, qty }]
    })
  }, [])

  const removeOffer = useCallback((itemId: string) => {
    setOfferItems((prev) => prev.filter((i) => i.item_id !== itemId))
  }, [])

  const addWant = useCallback((itemId: string, qty: number) => {
    setWantItems((prev) => {
      const idx = prev.findIndex((i) => i.item_id === itemId)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = { item_id: itemId, qty }; return next
      }
      return [...prev, { item_id: itemId, qty }]
    })
  }, [])

  const removeWant = useCallback((itemId: string) => {
    setWantItems((prev) => prev.filter((i) => i.item_id !== itemId))
  }, [])

  const handleSend = async () => {
    if (!supabase || !user) return
    if (offerItems.length === 0 && offerGold === 0) {
      pushToast({ kind: 'generic', message: 'You must offer at least one item or some gold.', type: 'error' })
      return
    }
    if (offerGold > myGoldBalance) {
      pushToast({ kind: 'generic', message: `You only have ${myGoldBalance}🪙`, type: 'error' })
      return
    }
    setSending(true)
    // Online recipient → 10 min; offline → 48 h
    const expireMs = recipient.is_online ? 10 * 60 * 1000 : 48 * 60 * 60 * 1000
    const expires_at = new Date(Date.now() + expireMs).toISOString()
    const { data, error } = await supabase.rpc('create_trade_offer', {
      p_recipient_id: recipient.id,
      p_initiator_items: offerItems,
      p_recipient_items: wantItems,
      p_message: message.trim() || null,
      p_expires_at: expires_at,
      p_initiator_gold: offerGold,
      p_recipient_gold: wantGold,
    })
    setSending(false)
    const result = data as { ok: boolean; error?: string; offer_id?: string } | null
    if (error || !result?.ok) {
      pushToast({ kind: 'generic', message: result?.error ?? 'Failed to send trade offer.', type: 'error' })
      return
    }
    // Reservation placed server-side; refresh local inventory + gold
    refreshInventory(user.id)
    if (offerGold > 0) useGoldStore.getState().syncFromSupabase(user.id)
    const partialOffer: TradeOffer = {
      id: result.offer_id!,
      initiator_id: user.id,
      recipient_id: recipient.id,
      initiator_items: offerItems,
      recipient_items: wantItems,
      initiator_gold: offerGold,
      recipient_gold: wantGold,
      status: 'pending',
      message: message.trim() || null,
      expires_at,
      created_at: new Date().toISOString(),
    }
    setOutgoingOffer(partialOffer)
    pushToast({
      kind: 'generic',
      message: recipient.is_online
        ? `Trade offer sent to ${recipient.username}! Expires in 10 min.`
        : `Trade offer sent! ${recipient.username} will see it when they come online (48h).`,
      type: 'success',
    })
    closeModal()
  }

  return (
    <div className="space-y-4">
      {inspectId && (
        <TradeItemInspectPopup
          itemId={inspectId.id}
          qty={inspectId.qty}
          onClose={() => setInspectId(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="relative shrink-0">
          <AvatarWithFrame avatar={recipient.avatar_url || '🤖'} frameId={recipient.equipped_frame}
            sizeClass="w-9 h-9" textClass="text-base" roundedClass="rounded-full" ringInsetClass="-inset-0.5" />
          <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-0 ${recipient.is_online ? 'bg-green-500' : 'bg-gray-600'}`} />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{recipient.username || 'Friend'}</p>
          <p className="text-[10px] text-gray-500">
            {recipient.is_online ? 'Online · expires in 10 min' : 'Offline · expires in 48 h'}
          </p>
        </div>
      </div>

      {/* Two-column trade area */}
      <div className="flex gap-2" style={{ minHeight: 220 }}>
        <TradeColumn
          title="You offer"
          emptyHint="Your inventory is empty"
          items={offerItems}
          inventory={myInv}
          onAdd={addOffer}
          onRemove={removeOffer}
          onInspect={(id) => {
            setInspectId({ id, qty: offerItems.find(i => i.item_id === id)?.qty ?? myInv.find(r => r.item_id === id)?.qty ?? 1 })
          }}
        />
        <div className="flex items-center shrink-0 self-center">
          <span className="text-gray-700 text-xs">⇄</span>
        </div>
        <TradeColumn
          title="You want"
          emptyHint={recipientInv.length === 0 ? 'Loading their items…' : 'Leave empty to gift'}
          items={wantItems}
          inventory={recipientInv}
          onAdd={addWant}
          onRemove={removeWant}
          onInspect={(id) => {
            setInspectId({ id, qty: wantItems.find(i => i.item_id === id)?.qty ?? recipientInv.find(r => r.item_id === id)?.qty ?? 1 })
          }}
        />
      </div>

      {/* Gold row */}
      <div className="flex gap-3 items-center">
        <div className="flex-1 min-w-0">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">Also offer 🪙</label>
          <div className="relative">
            <input
              type="number" min={0} max={myGoldBalance} value={offerGold || ''}
              onChange={(e) => setOfferGold(Math.max(0, Math.min(myGoldBalance, parseInt(e.target.value) || 0)))}
              placeholder="0"
              className="w-full bg-surface-2/60 border border-amber-500/20 rounded px-2.5 py-1.5 text-xs text-amber-300 placeholder-gray-600 focus:outline-none focus:border-amber-500/40 font-mono"
            />
            {offerGold > 0 && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-600">of {myGoldBalance}</span>
            )}
          </div>
        </div>
        <div className="shrink-0 pt-4">
          <span className="text-gray-700 text-sm">⇄</span>
        </div>
        <div className="flex-1 min-w-0">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">Also want 🪙</label>
          <input
            type="number" min={0} value={wantGold || ''}
            onChange={(e) => setWantGold(Math.max(0, parseInt(e.target.value) || 0))}
            placeholder="0"
            className="w-full bg-surface-2/60 border border-amber-500/20 rounded px-2.5 py-1.5 text-xs text-amber-300 placeholder-gray-600 focus:outline-none focus:border-amber-500/40 font-mono"
          />
        </div>
      </div>

      {/* Message */}
      <div>
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Message (optional)</label>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={120}
          placeholder="e.g. fair swap for my mythic?"
          className="mt-1 w-full bg-surface-2/60 border border-white/[0.08] rounded px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-accent/40"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={closeModal}
          className="flex-1 py-2 rounded border border-white/10 text-xs text-gray-400 hover:text-white hover:border-white/20 transition-colors">
          Cancel
        </button>
        <button type="button" onClick={handleSend} disabled={sending}
          className="flex-1 py-2 rounded border border-accent/40 bg-accent/10 text-xs font-semibold text-accent hover:bg-accent/20 transition-colors disabled:opacity-50">
          {sending ? 'Sending…' : 'Send Offer'}
        </button>
      </div>
    </div>
  )
}

// ─── Trade complete reveal (bag-opening style — all items at once) ────────────

const EMERALD = { color: '#34d399', border: '#34d39955', glow: '#34d399' }

function TradeRevealItem({
  item,
  delay,
  hasMultiple,
}: {
  item: TradeItem
  delay: number
  hasMultiple: boolean
}) {
  const def = findTradeDef(item.item_id)
  if (!def) return null
  const r = normalizeRarity(def.rarity)
  const theme = RARITY_THEME[r]
  return (
    <motion.div
      className="rounded-lg border p-3.5 relative overflow-hidden cursor-default snap-start flex-none"
      style={{
        width: hasMultiple ? '200px' : '100%',
        borderColor: theme.border,
        background: `linear-gradient(135deg, ${theme.glow}18 0%, rgba(8,8,16,0.95) 60%)`,
        boxShadow: `0 0 16px ${theme.glow}44`,
      }}
      initial={{ opacity: 0, x: 20, scale: 0.88 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 280, damping: 24, delay }}
    >
      <div className="absolute inset-0 pointer-events-none rounded-lg"
        style={{ background: `radial-gradient(circle at 50% 38%, ${theme.glow} 0%, transparent 55%)`, opacity: 0.28 }} />
      <motion.div
        className="absolute inset-0 pointer-events-none rounded-lg"
        animate={{ opacity: [0.25, 0.5, 0.28] }}
        transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
        style={{ boxShadow: `inset 0 0 18px ${theme.glow}` }}
      />
      {item.qty > 1 && (
        <div className="absolute top-2 right-2 z-10 min-w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] font-black tabular-nums"
          style={{ background: theme.color, color: '#000', boxShadow: `0 0 8px ${theme.glow}88` }}>
          ×{item.qty}
        </div>
      )}
      <div className="flex justify-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: ({ common: 1.0, rare: 1.04, epic: 1.08, legendary: 1.14, mythic: 1.18 } as Record<string, number>)[def.rarity] ?? 1.0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18, delay: delay + 0.05 }}
        >
          {(def as { image?: string }).image ? (
            <img src={(def as { image?: string }).image} alt="" className="w-[60px] h-[60px] object-contain select-none" draggable={false} />
          ) : (
            <p className="text-4xl">{def.icon}</p>
          )}
        </motion.div>
      </div>
      <p className="text-sm text-white font-semibold mt-2 leading-tight">{def.name}</p>
      <p className="text-[10px] font-mono uppercase tracking-wider mt-0.5" style={{ color: theme.color }}>{r}</p>
    </motion.div>
  )
}

function TradeCompleteReveal({
  received,
  goldReceived,
  onCollect,
}: {
  received: TradeItem[]
  goldReceived: number
  onCollect: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollPos, setScrollPos] = useState<'start' | 'middle' | 'end'>('start')

  const updateScrollPos = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    if (scrollWidth <= clientWidth + 2) { setScrollPos('start'); return }
    if (scrollLeft <= 2) setScrollPos('start')
    else if (scrollLeft + clientWidth >= scrollWidth - 2) setScrollPos('end')
    else setScrollPos('middle')
  }, [])

  const scrollBy = useCallback((dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'right' ? 160 : -160, behavior: 'smooth' })
  }, [])

  const hasItems = received.length > 0
  const hasGold = goldReceived > 0
  const hasMultiple = received.length + (hasGold ? 1 : 0) > 1

  if (!hasItems && !hasGold) {
    return createPortal(
      <motion.div
        key="trade-done-empty"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[120] flex flex-col items-center justify-center gap-4"
        style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(4px)' }}
        onClick={onCollect}
      >
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/40">
          <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-base font-bold text-white">Trade Complete!</p>
        <button type="button" onClick={onCollect}
          className="px-8 py-2.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors">
          Collect
        </button>
      </motion.div>,
      document.body
    )
  }

  return createPortal(
    <motion.div
      key="trade-reveal-portal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      onClick={onCollect}
    >
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />

      <motion.div
        key="trade-reveal-card"
        initial={{ scale: 0.82, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.88, opacity: 0, y: 16 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28, mass: 0.9 }}
        onClick={(e) => e.stopPropagation()}
        className="w-[300px] rounded-lg border p-5 text-center relative overflow-hidden"
        style={{
          borderColor: EMERALD.border,
          background: `linear-gradient(160deg, ${EMERALD.glow}1A 0%, rgba(8,8,16,0.97) 55%)`,
          boxShadow: `0 0 40px ${EMERALD.glow}, 0 4px 32px rgba(0,0,0,0.7)`,
        }}
      >
        {/* Ambient glow */}
        <motion.div
          aria-hidden
          className="absolute inset-0 pointer-events-none rounded-lg"
          style={{ background: `radial-gradient(circle at 50% 12%, ${EMERALD.glow} 0%, transparent 55%)` }}
          animate={{ opacity: [0.35, 0.55, 0.38] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Trade icon */}
        <motion.div
          className="mx-auto w-fit relative z-10"
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        >
          <div
            className="w-[72px] h-[72px] rounded-lg border flex items-center justify-center relative overflow-hidden mx-auto"
            style={{
              borderColor: EMERALD.border,
              background: `radial-gradient(circle at 50% 35%, ${EMERALD.glow}55 0%, rgba(8,8,16,0.92) 70%)`,
              boxShadow: `0 0 28px ${EMERALD.glow}CC`,
            }}
          >
            <span className="text-3xl select-none">⇄</span>
          </div>
        </motion.div>

        {/* Label */}
        <div className="mt-3 relative z-10">
          <p className="text-[10px] font-mono uppercase tracking-wider" style={{ color: EMERALD.color }}>
            Trade Complete
          </p>
          <p className="text-sm text-white/80 font-medium mt-0.5">You received</p>
          {hasMultiple && (
            <p className="text-[10px] text-gray-500 mt-0.5">{received.length + (hasGold ? 1 : 0)} items</p>
          )}
        </div>

        {/* Items scroll */}
        <div className="mt-3 relative z-10">
          {hasMultiple && scrollPos !== 'start' && (
            <button type="button" onClick={() => scrollBy('left')}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
              style={{ background: 'rgba(8,8,16,0.85)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)', marginLeft: '-12px' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 2L4 6l3.5 4" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          )}
          {hasMultiple && scrollPos !== 'end' && (
            <button type="button" onClick={() => scrollBy('right')}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
              style={{ background: 'rgba(8,8,16,0.85)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)', marginRight: '-12px' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2L8 6l-3.5 4" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          )}
          <div
            ref={scrollRef}
            onScroll={updateScrollPos}
            className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory scroll-smooth"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
          >
            {received.map((item, i) => (
              <TradeRevealItem key={item.item_id} item={item} delay={i * 0.05} hasMultiple={hasMultiple} />
            ))}
            {hasGold && (
              <motion.div
                className="flex-none snap-start rounded-lg border flex flex-col items-center justify-center gap-1.5 py-3.5 relative overflow-hidden"
                style={{
                  width: hasMultiple ? '160px' : '100%',
                  borderColor: 'rgba(245,158,11,0.4)',
                  background: 'linear-gradient(160deg, rgba(245,158,11,0.10) 0%, rgba(8,8,16,0.95) 65%)',
                }}
                initial={{ opacity: 0, x: 20, scale: 0.88 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 280, damping: 24, delay: received.length * 0.05 }}
              >
                <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 50% 35%, rgba(245,158,11,0.20) 0%, transparent 65%)' }} />
                <span className="text-4xl leading-none select-none relative z-10">🪙</span>
                <p className="text-lg font-bold text-amber-300 relative z-10">{goldReceived}</p>
                <p className="text-[10px] font-mono uppercase tracking-wider text-amber-500/60 relative z-10">gold</p>
              </motion.div>
            )}
            {hasMultiple && <div className="flex-none w-5" aria-hidden />}
          </div>
        </div>

        {/* Collect button */}
        <motion.div
          className="mt-4 relative z-10"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.2, ease: 'easeOut' }}
        >
          <button
            type="button"
            onClick={onCollect}
            className="w-full h-10 rounded-lg text-sm font-semibold transition-all active:scale-[0.97]"
            style={{ color: EMERALD.color, border: `1px solid ${EMERALD.border}`, background: `${EMERALD.color}22` }}
          >
            Collect
          </button>
        </motion.div>
      </motion.div>
    </motion.div>,
    document.body
  )
}

// ─── Review mode (recipient) ──────────────────────────────────────────────────

function ReviewTrade({ offer, initiatorProfile }: { offer: TradeOffer; initiatorProfile?: FriendProfile }) {
  const { user } = useAuthStore()
  const closeModal = useTradeStore((s) => s.closeModal)
  const setIncomingOffer = useTradeStore((s) => s.setIncomingOffer)
  const pushToast = useToastStore((s) => s.push)
  const [busy, setBusy] = useState(false)
  const [tradeResult, setTradeResult] = useState<{ items: TradeItem[]; gold: number } | null>(null)
  const [inspectId, setInspectId] = useState<{ id: string; qty: number } | null>(null)
  const countdown = useCountdown(offer.expires_at)
  const isExpired = countdown === 'Expired'

  const handle = async (action: 'accept' | 'decline') => {
    if (!supabase) return
    setBusy(true)
    const rpc = action === 'accept' ? 'accept_trade_offer' : 'decline_trade_offer'
    const { data, error } = await supabase.rpc(rpc, { p_offer_id: offer.id })
    setBusy(false)
    const result = data as { ok: boolean; error?: string } | null
    if (error || !result?.ok) {
      pushToast({ kind: 'generic', message: result?.error ?? 'Trade failed.', type: 'error' })
      return
    }
    setIncomingOffer(null)
    if (action === 'accept') {
      if (user) {
        refreshInventory(user.id)
        useGoldStore.getState().syncFromSupabase(user.id)
      }
      // Show reveal instead of immediately closing
      setTradeResult({ items: offer.initiator_items, gold: offer.initiator_gold ?? 0 })
    } else {
      pushToast({ kind: 'generic', message: 'Trade declined.', type: 'error' })
      closeModal()
    }
  }

  const name = initiatorProfile?.username || offer.initiator_username || 'Someone'

  // Show complete reveal screen
  if (tradeResult) {
    return (
      <TradeCompleteReveal
        received={tradeResult.items}
        goldReceived={tradeResult.gold}
        onCollect={closeModal}
      />
    )
  }

  return (
    <div className="space-y-4">
      {inspectId && (
        <TradeItemInspectPopup
          itemId={inspectId.id}
          qty={inspectId.qty}
          onClose={() => setInspectId(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="relative shrink-0">
          <AvatarWithFrame
            avatar={initiatorProfile?.avatar_url || offer.initiator_avatar || '🤖'}
            frameId={initiatorProfile?.equipped_frame}
            sizeClass="w-9 h-9" textClass="text-base" roundedClass="rounded-full" ringInsetClass="-inset-0.5"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{name}</p>
          <p className="text-[10px] text-gray-500">
            Offer received · expires in{' '}
            <span className={isExpired ? 'text-red-400' : 'text-amber-400'}>{countdown}</span>
          </p>
        </div>
      </div>

      {/* Message */}
      {offer.message && (
        <div className="bg-surface-2/40 border border-white/[0.06] rounded px-2.5 py-2">
          <p className="text-xs text-gray-300 italic">"{offer.message}"</p>
        </div>
      )}

      {/* Items + gold */}
      <div className="flex gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">They offer you</span>
          <div className="min-h-[48px] space-y-1">
            {offer.initiator_items.length === 0 && !offer.initiator_gold ? (
              <div className="rounded border border-dashed border-white/[0.08] p-3 text-center">
                <p className="text-[10px] text-gray-600">Nothing</p>
              </div>
            ) : (
              <>
                {offer.initiator_items.map((t) => (
                  <ItemSlot key={t.item_id} itemId={t.item_id} qty={t.qty}
                    onInspect={(id) => setInspectId({ id, qty: t.qty })} />
                ))}
                {(offer.initiator_gold ?? 0) > 0 && (
                  <div className="flex items-center gap-2 rounded border border-amber-500/30 px-2 py-1.5 bg-amber-500/10">
                    <span className="text-base leading-none">🪙</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-amber-300">{offer.initiator_gold} Gold</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center shrink-0 pt-5">
          <span className="text-gray-600 text-sm">⇄</span>
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">They want from you</span>
          <div className="min-h-[48px] space-y-1">
            {offer.recipient_items.length === 0 && !offer.recipient_gold ? (
              <div className="rounded border border-dashed border-white/[0.08] p-3 text-center">
                <p className="text-[10px] text-gray-600">Nothing</p>
              </div>
            ) : (
              <>
                {offer.recipient_items.map((t) => (
                  <ItemSlot key={t.item_id} itemId={t.item_id} qty={t.qty}
                    onInspect={(id) => setInspectId({ id, qty: t.qty })} />
                ))}
                {(offer.recipient_gold ?? 0) > 0 && (
                  <div className="flex items-center gap-2 rounded border border-amber-500/30 px-2 py-1.5 bg-amber-500/10">
                    <span className="text-base leading-none">🪙</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-amber-300">{offer.recipient_gold} Gold</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={() => handle('decline')} disabled={busy || isExpired}
          className="flex-1 py-2 rounded border border-red-500/30 text-xs text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40">
          Decline
        </button>
        <button type="button" onClick={() => handle('accept')} disabled={busy || isExpired}
          className="flex-1 py-2 rounded border border-accent/40 bg-accent/10 text-xs font-semibold text-accent hover:bg-accent/20 transition-colors disabled:opacity-50">
          {busy ? 'Processing…' : 'Accept Trade'}
        </button>
      </div>
    </div>
  )
}

// ─── Root export ──────────────────────────────────────────────────────────────

export function TradeModal() {
  const modalState = useTradeStore((s) => s.modalState)
  const closeModal = useTradeStore((s) => s.closeModal)

  if (modalState.mode === 'closed') return null

  // Inline-accept result — full screen chest reveal, no wrapper modal
  if (modalState.mode === 'result') {
    return (
      <TradeCompleteReveal
        received={modalState.received}
        goldReceived={modalState.goldReceived}
        onCollect={closeModal}
      />
    )
  }

  const isReview = modalState.mode === 'review'
  const title = isReview ? 'Incoming Trade' : 'New Trade Offer'

  return (
    <AnimatePresence>
      <motion.div
        key="trade-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
        onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}
      >
        <motion.div
          key="trade-panel"
          initial={{ opacity: 0, scale: 0.92, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 12 }}
          transition={{ duration: 0.15 }}
          className="w-full max-w-md rounded-card bg-surface-0 border border-white/[0.10] shadow-2xl overflow-hidden"
        >
          {/* Header bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <span className="text-sm">⇄</span>
              <h2 className="text-sm font-semibold text-white">{title}</h2>
            </div>
            {/* No close button on review — player must Accept or Decline */}
            {!isReview && (
              <button type="button" onClick={closeModal}
                className="text-gray-500 hover:text-white transition-colors p-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Body */}
          <div className="p-4">
            {modalState.mode === 'create' && <CreateTrade recipient={modalState.recipient} />}
            {modalState.mode === 'review' && (
              <ReviewTrade offer={modalState.offer} initiatorProfile={modalState.initiatorProfile} />
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
