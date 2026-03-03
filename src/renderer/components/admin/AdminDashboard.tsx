import { useState, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { LOOT_ITEMS, CHEST_DEFS, type LootRarity, type LootSlot, type ChestType } from '../../lib/loot'
import { BOSSES } from '../../lib/combat'
import {
  loadAdminConfig, saveAdminConfig,
  type AdminConfig, type ItemOverride, type BossOverride,
} from '../../lib/itemConfig'
import { playClickSound } from '../../lib/sounds'
import { MOTION } from '../../lib/motion'

// ─── Types ────────────────────────────────────────────────────────────────────

type AdminTab = 'items' | 'bosses' | 'chests'

const RARITIES: LootRarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic']
const SLOTS: LootSlot[] = ['head', 'body', 'legs', 'ring', 'consumable', 'plant']
const PERK_TYPES = [
  'cosmetic', 'xp_skill_boost', 'chest_drop_boost', 'status_title',
  'xp_global_boost', 'streak_shield', 'focus_boost', 'atk_boost',
  'hp_boost', 'hp_regen_boost', 'harvested_plant',
]
const CHEST_TYPES: ChestType[] = ['common_chest', 'rare_chest', 'epic_chest', 'legendary_chest']

const RARITY_COLORS: Record<string, string> = {
  common: 'text-gray-400',
  rare: 'text-sky-400',
  epic: 'text-purple-400',
  legendary: 'text-yellow-400',
  mythic: 'text-pink-400',
}

// ─── Item Edit Modal ───────────────────────────────────────────────────────────

interface ItemEditState {
  id: string
  isCustom: boolean
  name: string
  icon: string
  image: string
  rarity: string
  slot: string
  description: string
  perkType: string
  perkValue: string
  perkTarget: string
  perkDescription: string
}

function ItemEditModal({
  state,
  onSave,
  onDelete,
  onClose,
}: {
  state: ItemEditState
  onSave: (s: ItemEditState) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [form, setForm] = useState(state)
  const set = (k: keyof ItemEditState, v: string) => setForm((p) => ({ ...p, [k]: v }))

  const handleImagePick = async () => {
    const url = await window.electronAPI?.admin?.pickImageFile?.()
    if (url) set('image', url)
  }

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-discord-card border border-white/10 rounded-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold text-white">
            {state.isCustom && state.id === '_new' ? 'Add Custom Item' : `Edit — ${state.name}`}
          </p>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">✕</button>
        </div>

        <Field label="Name">
          <input className={INPUT} value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Icon (emoji / text)">
          <input className={INPUT} value={form.icon} onChange={(e) => set('icon', e.target.value)} maxLength={8} />
        </Field>

        <Field label="Image">
          <div className="flex gap-2 items-center">
            {form.image && (
              <img src={form.image} className="w-10 h-10 object-contain rounded border border-white/10" />
            )}
            <button type="button" onClick={handleImagePick} className={BTN_SECONDARY}>
              {form.image ? 'Change PNG' : 'Upload PNG'}
            </button>
            {form.image && (
              <button type="button" onClick={() => set('image', '')} className="text-xs text-red-400 hover:text-red-300">
                Clear
              </button>
            )}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Rarity">
            <select className={INPUT} value={form.rarity} onChange={(e) => set('rarity', e.target.value)}>
              {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Slot">
            <select className={INPUT} value={form.slot} onChange={(e) => set('slot', e.target.value)}>
              {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Description">
          <textarea className={INPUT + ' resize-none h-16'} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>

        <Field label="Perk Type">
          <select className={INPUT} value={form.perkType} onChange={(e) => set('perkType', e.target.value)}>
            {PERK_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Perk Value">
            <input className={INPUT} value={form.perkValue} onChange={(e) => set('perkValue', e.target.value)} />
          </Field>
          <Field label="Perk Target">
            <input className={INPUT} value={form.perkTarget} onChange={(e) => set('perkTarget', e.target.value)} placeholder="optional" />
          </Field>
        </div>

        <Field label="Perk Description">
          <input className={INPUT} value={form.perkDescription} onChange={(e) => set('perkDescription', e.target.value)} />
        </Field>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => { onSave(form); playClickSound() }}
            className="flex-1 py-2 rounded-xl bg-cyber-neon/20 border border-cyber-neon/35 text-cyber-neon text-sm font-semibold hover:bg-cyber-neon/30 transition-colors"
          >
            Save
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={() => { onDelete(); playClickSound() }}
              className="py-2 px-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm hover:bg-red-500/20 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Boss Edit Modal ───────────────────────────────────────────────────────────

interface BossEditState {
  id: string
  name: string
  icon: string
  image: string
  hp: string
  atk: string
  gold: string
  lootChance: string
  lootTier: string
}

function BossEditModal({
  state,
  onSave,
  onClose,
}: {
  state: BossEditState
  onSave: (s: BossEditState) => void
  onClose: () => void
}) {
  const [form, setForm] = useState(state)
  const set = (k: keyof BossEditState, v: string) => setForm((p) => ({ ...p, [k]: v }))

  const handleImagePick = async () => {
    const url = await window.electronAPI?.admin?.pickImageFile?.()
    if (url) set('image', url)
  }

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-discord-card border border-white/10 rounded-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold text-white">Edit Boss — {state.name}</p>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">✕</button>
        </div>

        <Field label="Name">
          <input className={INPUT} value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Icon (emoji)">
          <input className={INPUT} value={form.icon} onChange={(e) => set('icon', e.target.value)} maxLength={8} />
        </Field>

        <Field label="Image">
          <div className="flex gap-2 items-center">
            {form.image && (
              <img src={form.image} className="w-10 h-10 object-contain rounded border border-white/10" />
            )}
            <button type="button" onClick={handleImagePick} className={BTN_SECONDARY}>
              {form.image ? 'Change PNG' : 'Upload PNG'}
            </button>
            {form.image && (
              <button type="button" onClick={() => set('image', '')} className="text-xs text-red-400 hover:text-red-300">
                Clear
              </button>
            )}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="HP">
            <input className={INPUT} type="number" value={form.hp} onChange={(e) => set('hp', e.target.value)} min={1} />
          </Field>
          <Field label="ATK (dmg/s)">
            <input className={INPUT} type="number" value={form.atk} onChange={(e) => set('atk', e.target.value)} min={0} step={0.1} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Gold reward">
            <input className={INPUT} type="number" value={form.gold} onChange={(e) => set('gold', e.target.value)} min={0} />
          </Field>
          <Field label="Chest drop % (0–100)">
            <input className={INPUT} type="number" value={form.lootChance} onChange={(e) => set('lootChance', e.target.value)} min={0} max={100} />
          </Field>
        </div>

        <Field label="Drop chest type">
          <select className={INPUT} value={form.lootTier} onChange={(e) => set('lootTier', e.target.value)}>
            <option value="">none</option>
            {CHEST_TYPES.map((c) => <option key={c} value={c}>{CHEST_DEFS[c].icon} {CHEST_DEFS[c].name}</option>)}
          </select>
        </Field>

        <button
          type="button"
          onClick={() => { onSave(form); playClickSound() }}
          className="w-full mt-2 py-2 rounded-xl bg-cyber-neon/20 border border-cyber-neon/35 text-cyber-neon text-sm font-semibold hover:bg-cyber-neon/30 transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  )
}

// ─── Shared UI primitives ──────────────────────────────────────────────────────

const INPUT = 'w-full bg-discord-darker border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-cyber-neon/40'
const BTN_SECONDARY = 'px-3 py-1.5 rounded-lg bg-discord-darker border border-white/10 text-xs text-gray-300 hover:border-white/20 transition-colors'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</p>
      {children}
    </div>
  )
}

// ─── Items Tab ─────────────────────────────────────────────────────────────────

function ItemsTab({ cfg, setCfg }: { cfg: AdminConfig; setCfg: (c: AdminConfig) => void }) {
  const [search, setSearch] = useState('')
  const [editState, setEditState] = useState<ItemEditState | null>(null)

  const hiddenSet = useMemo(() => new Set(cfg.hiddenItems ?? []), [cfg.hiddenItems])
  const overrides = cfg.itemOverrides ?? {}
  const customItems = cfg.customItems ?? []

  // All displayable items: base (no plant/consumable) + custom
  const allItems = useMemo(() => {
    const base = LOOT_ITEMS.filter((i) => i.slot !== 'plant' && i.slot !== 'consumable')
    return [...base, ...customItems]
  }, [customItems])

  const filtered = useMemo(() => {
    if (!search) return allItems
    const q = search.toLowerCase()
    return allItems.filter((i) => i.name.toLowerCase().includes(q) || i.id.includes(q) || i.slot.includes(q))
  }, [allItems, search])

  const openEdit = (id: string, isCustom: boolean) => {
    const base = allItems.find((i) => i.id === id)
    if (!base) return
    const ov = overrides[id] ?? {}
    setEditState({
      id,
      isCustom,
      name: ov.name ?? base.name,
      icon: ov.icon ?? base.icon,
      image: ov.image ?? base.image ?? '',
      rarity: ov.rarity ?? base.rarity,
      slot: base.slot,
      description: ov.description ?? base.description,
      perkType: ov.perkType ?? base.perkType,
      perkValue: String(ov.perkValue ?? base.perkValue),
      perkTarget: ov.perkTarget ?? base.perkTarget ?? '',
      perkDescription: ov.perkDescription ?? base.perkDescription,
    })
  }

  const openAddNew = () => {
    setEditState({
      id: '_new',
      isCustom: true,
      name: '',
      icon: '🎁',
      image: '',
      rarity: 'common',
      slot: 'ring',
      description: '',
      perkType: 'cosmetic',
      perkValue: '0',
      perkTarget: '',
      perkDescription: '',
    })
  }

  const handleSave = (form: ItemEditState) => {
    if (form.isCustom) {
      if (form.id === '_new') {
        // Create new custom item
        const newId = `custom_${Date.now()}`
        const next: AdminConfig = {
          ...cfg,
          customItems: [
            ...(cfg.customItems ?? []),
            {
              id: newId,
              name: form.name || 'Custom Item',
              slot: form.slot as LootSlot,
              rarity: form.rarity as LootRarity,
              icon: form.icon || '🎁',
              image: form.image || undefined,
              description: form.description,
              perkType: form.perkType,
              perkValue: isNaN(Number(form.perkValue)) ? form.perkValue : Number(form.perkValue),
              perkTarget: form.perkTarget || undefined,
              perkDescription: form.perkDescription,
            },
          ],
        }
        setCfg(next)
      } else {
        // Edit existing custom item
        const next: AdminConfig = {
          ...cfg,
          customItems: (cfg.customItems ?? []).map((c) =>
            c.id === form.id
              ? {
                  ...c,
                  name: form.name,
                  icon: form.icon,
                  image: form.image || undefined,
                  rarity: form.rarity as LootRarity,
                  slot: form.slot as LootSlot,
                  description: form.description,
                  perkType: form.perkType,
                  perkValue: isNaN(Number(form.perkValue)) ? form.perkValue : Number(form.perkValue),
                  perkTarget: form.perkTarget || undefined,
                  perkDescription: form.perkDescription,
                }
              : c
          ),
        }
        setCfg(next)
      }
    } else {
      // Save override for base item
      const ov: ItemOverride = {}
      const base = LOOT_ITEMS.find((i) => i.id === form.id)!
      if (form.name !== base.name) ov.name = form.name
      if (form.icon !== base.icon) ov.icon = form.icon
      if (form.image !== (base.image ?? '')) ov.image = form.image || undefined as unknown as string
      if (form.rarity !== base.rarity) ov.rarity = form.rarity as LootRarity
      if (form.description !== base.description) ov.description = form.description
      if (form.perkType !== base.perkType) ov.perkType = form.perkType
      if (form.perkValue !== String(base.perkValue)) ov.perkValue = isNaN(Number(form.perkValue)) ? form.perkValue : Number(form.perkValue)
      if (form.perkTarget !== (base.perkTarget ?? '')) ov.perkTarget = form.perkTarget || undefined as unknown as string
      if (form.perkDescription !== base.perkDescription) ov.perkDescription = form.perkDescription

      const next: AdminConfig = {
        ...cfg,
        itemOverrides: { ...overrides, [form.id]: ov },
      }
      setCfg(next)
    }
    setEditState(null)
  }

  const handleDeleteCustom = (id: string) => {
    setCfg({ ...cfg, customItems: (cfg.customItems ?? []).filter((c) => c.id !== id) })
    setEditState(null)
  }

  const toggleHide = (id: string) => {
    const hidden = new Set(cfg.hiddenItems ?? [])
    if (hidden.has(id)) hidden.delete(id)
    else hidden.add(id)
    setCfg({ ...cfg, hiddenItems: [...hidden] })
  }

  const resetOverride = (id: string) => {
    const { [id]: _, ...rest } = { ...(cfg.itemOverrides ?? {}) }
    setCfg({ ...cfg, itemOverrides: rest })
  }

  const isCustomItem = useCallback(
    (id: string) => (cfg.customItems ?? []).some((c) => c.id === id),
    [cfg.customItems]
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 mb-3">
        <input
          className={INPUT + ' flex-1'}
          placeholder="Search items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          onClick={openAddNew}
          className="px-3 py-1.5 rounded-xl bg-cyber-neon/15 border border-cyber-neon/30 text-cyber-neon text-xs font-semibold hover:bg-cyber-neon/25 transition-colors shrink-0"
        >
          + Add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {filtered.map((item) => {
          const isHidden = hiddenSet.has(item.id)
          const hasOverride = !!overrides[item.id] && Object.keys(overrides[item.id]).length > 0
          const isCustom = isCustomItem(item.id)
          const eff = { ...item, ...(overrides[item.id] ?? {}) }

          return (
            <div
              key={item.id}
              className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors ${
                isHidden
                  ? 'bg-discord-darker/40 border-white/5 opacity-50'
                  : 'bg-discord-darker/60 border-white/8 hover:border-white/15'
              }`}
            >
              {/* Icon / image */}
              <div className="w-9 h-9 rounded-lg bg-discord-card border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                {eff.image
                  ? <img src={eff.image} className="w-full h-full object-contain" />
                  : <span className="text-lg">{eff.icon}</span>
                }
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold truncate ${isHidden ? 'line-through text-gray-500' : 'text-white'}`}>
                  {eff.name}
                </p>
                <p className="text-[10px] text-gray-600 font-mono">
                  <span className={RARITY_COLORS[eff.rarity] ?? 'text-gray-400'}>{eff.rarity}</span>
                  {' · '}{eff.slot}
                  {isCustom && <span className="text-amber-500/70"> · custom</span>}
                  {hasOverride && !isCustom && <span className="text-cyber-neon/50"> · edited</span>}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => { openEdit(item.id, isCustom); playClickSound() }}
                  className="text-[10px] px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-colors"
                >
                  Edit
                </button>
                {hasOverride && !isCustom && (
                  <button
                    onClick={() => { resetOverride(item.id); playClickSound() }}
                    className="text-[10px] px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-500 hover:text-red-400 transition-colors"
                    title="Reset to default"
                  >
                    ↺
                  </button>
                )}
                {!isCustom && (
                  <button
                    onClick={() => { toggleHide(item.id); playClickSound() }}
                    className={`text-[10px] px-2 py-1 rounded-lg border transition-colors ${
                      isHidden
                        ? 'bg-white/5 border-white/10 text-cyber-neon hover:bg-white/10'
                        : 'bg-white/5 border-white/10 text-gray-500 hover:text-red-400'
                    }`}
                  >
                    {isHidden ? 'Show' : 'Hide'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {editState && (
        <ItemEditModal
          state={editState}
          onSave={handleSave}
          onDelete={editState.isCustom && editState.id !== '_new' ? () => handleDeleteCustom(editState.id) : undefined}
          onClose={() => setEditState(null)}
        />
      )}
    </div>
  )
}

// ─── Bosses Tab ────────────────────────────────────────────────────────────────

function BossesTab({ cfg, setCfg }: { cfg: AdminConfig; setCfg: (c: AdminConfig) => void }) {
  const [editState, setEditState] = useState<BossEditState | null>(null)

  const openEdit = (id: string) => {
    const base = BOSSES.find((b) => b.id === id)!
    const ov = (cfg.bossOverrides ?? {})[id] ?? {}
    setEditState({
      id,
      name: ov.name ?? base.name,
      icon: ov.icon ?? base.icon,
      image: ov.image ?? base.image ?? '',
      hp: String(ov.hp ?? base.hp),
      atk: String(ov.atk ?? base.atk),
      gold: String(ov.rewards?.gold ?? base.rewards.gold),
      lootChance: String(Math.round((ov.rewards?.lootChance ?? base.rewards.lootChance ?? 0) * 100)),
      lootTier: ov.rewards?.lootTier ?? base.rewards.lootTier ?? '',
    })
  }

  const handleSave = (form: BossEditState) => {
    const base = BOSSES.find((b) => b.id === form.id)!
    const ov: BossOverride = {}
    if (form.name !== base.name) ov.name = form.name
    if (form.icon !== base.icon) ov.icon = form.icon
    if (form.image !== (base.image ?? '')) ov.image = form.image || undefined as unknown as string
    const hp = Number(form.hp); if (hp !== base.hp) ov.hp = hp
    const atk = Number(form.atk); if (atk !== base.atk) ov.atk = atk
    const gold = Number(form.gold)
    const lootChance = Number(form.lootChance) / 100
    const lootTier = form.lootTier || undefined
    if (
      gold !== base.rewards.gold ||
      lootChance !== (base.rewards.lootChance ?? 0) ||
      lootTier !== base.rewards.lootTier
    ) {
      ov.rewards = { gold, lootChance, lootTier }
    }

    setCfg({
      ...cfg,
      bossOverrides: { ...(cfg.bossOverrides ?? {}), [form.id]: ov },
    })
    setEditState(null)
  }

  const resetOverride = (id: string) => {
    const { [id]: _, ...rest } = { ...(cfg.bossOverrides ?? {}) }
    setCfg({ ...cfg, bossOverrides: rest })
  }

  return (
    <div className="space-y-2">
      {BOSSES.map((base) => {
        const ov = (cfg.bossOverrides ?? {})[base.id] ?? {}
        const eff = { ...base, ...ov, rewards: { ...base.rewards, ...(ov.rewards ?? {}) } }
        const hasOverride = Object.keys(ov).length > 0

        return (
          <div key={base.id} className="flex items-center gap-3 p-3 rounded-xl bg-discord-darker/60 border border-white/8 hover:border-white/15 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-discord-card border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
              {eff.image
                ? <img src={eff.image} className="w-full h-full object-contain" />
                : <span className="text-xl">{eff.icon}</span>
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">
                {eff.name}
                {hasOverride && <span className="text-cyber-neon/50 font-normal"> · edited</span>}
              </p>
              <p className="text-[10px] text-gray-600 font-mono">
                {eff.hp.toLocaleString()} HP · {eff.atk} dmg/s · 🪙{eff.rewards.gold}
                {eff.rewards.lootTier && (
                  <> · {Math.round((eff.rewards.lootChance ?? 0) * 100)}% {CHEST_DEFS[eff.rewards.lootTier as ChestType]?.icon}</>
                )}
              </p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <button
                onClick={() => { openEdit(base.id); playClickSound() }}
                className="text-[10px] px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-colors"
              >
                Edit
              </button>
              {hasOverride && (
                <button
                  onClick={() => { resetOverride(base.id); playClickSound() }}
                  className="text-[10px] px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-500 hover:text-red-400 transition-colors"
                  title="Reset to default"
                >
                  ↺
                </button>
              )}
            </div>
          </div>
        )
      })}

      {editState && (
        <BossEditModal
          state={editState}
          onSave={handleSave}
          onClose={() => setEditState(null)}
        />
      )}
    </div>
  )
}

// ─── Chests Tab ────────────────────────────────────────────────────────────────

function ChestsTab({ cfg, setCfg }: { cfg: AdminConfig; setCfg: (c: AdminConfig) => void }) {
  const [expanded, setExpanded] = useState<ChestType | null>('common_chest')
  const [newItemId, setNewItemId] = useState<Record<string, string>>({})
  const [newItemWeight, setNewItemWeight] = useState<Record<string, string>>({})

  const getWeights = (chestId: ChestType) =>
    (cfg.chestWeightOverrides ?? {})[chestId] ?? CHEST_DEFS[chestId].itemWeights

  const setWeights = (chestId: ChestType, weights: { itemId: string; weight: number }[]) => {
    setCfg({
      ...cfg,
      chestWeightOverrides: { ...(cfg.chestWeightOverrides ?? {}), [chestId]: weights },
    })
  }

  const totalWeight = (weights: { weight: number }[]) => weights.reduce((s, w) => s + w.weight, 0)

  const removeRow = (chestId: ChestType, itemId: string) => {
    setWeights(chestId, getWeights(chestId).filter((w) => w.itemId !== itemId))
  }

  const addRow = (chestId: ChestType) => {
    const id = newItemId[chestId]?.trim()
    const w = Number(newItemWeight[chestId])
    if (!id || !w) return
    const existing = getWeights(chestId)
    if (existing.some((e) => e.itemId === id)) return
    setWeights(chestId, [...existing, { itemId: id, weight: w }])
    setNewItemId((p) => ({ ...p, [chestId]: '' }))
    setNewItemWeight((p) => ({ ...p, [chestId]: '' }))
  }

  const resetChest = (chestId: ChestType) => {
    const { [chestId]: _, ...rest } = { ...(cfg.chestWeightOverrides ?? {}) }
    setCfg({ ...cfg, chestWeightOverrides: rest })
  }

  return (
    <div className="space-y-2">
      {CHEST_TYPES.map((chestId) => {
        const def = CHEST_DEFS[chestId]
        const weights = getWeights(chestId)
        const total = totalWeight(weights)
        const isOpen = expanded === chestId
        const isOverridden = !!(cfg.chestWeightOverrides ?? {})[chestId]

        return (
          <div key={chestId} className="rounded-xl bg-discord-darker/60 border border-white/8 overflow-hidden">
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : chestId)}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/[0.02] transition-colors"
            >
              <span className="text-xl shrink-0">{def.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white">
                  {def.name}
                  {isOverridden && <span className="text-cyber-neon/50 font-normal"> · edited</span>}
                </p>
                <p className="text-[10px] text-gray-600">{weights.length} items · total weight {total}</p>
              </div>
              <span className={`text-gray-600 text-xs transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>›</span>
            </button>

            {isOpen && (
              <div className="px-3 pb-3 space-y-1.5">
                {isOverridden && (
                  <button
                    type="button"
                    onClick={() => { resetChest(chestId); playClickSound() }}
                    className="text-[10px] text-red-400/70 hover:text-red-400 transition-colors mb-1"
                  >
                    ↺ Reset to defaults
                  </button>
                )}
                {weights.map((w) => {
                  const pct = total > 0 ? ((w.weight / total) * 100).toFixed(1) : '0.0'
                  const item = LOOT_ITEMS.find((i) => i.id === w.itemId)
                  return (
                    <div key={w.itemId} className="flex items-center gap-2 text-[11px]">
                      <span className="w-5 text-center shrink-0">{item?.icon ?? '❓'}</span>
                      <span className="flex-1 text-gray-400 truncate">{item?.name ?? w.itemId}</span>
                      <span className="text-gray-600 font-mono w-8 text-right shrink-0">{w.weight}</span>
                      <span className="text-gray-600/60 w-10 text-right shrink-0">{pct}%</span>
                      <button
                        onClick={() => { removeRow(chestId, w.itemId); playClickSound() }}
                        className="text-red-400/50 hover:text-red-400 transition-colors shrink-0 ml-1"
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}

                {/* Add row */}
                <div className="flex gap-2 mt-2 pt-2 border-t border-white/5">
                  <select
                    className={INPUT + ' flex-1 text-[11px]'}
                    value={newItemId[chestId] ?? ''}
                    onChange={(e) => setNewItemId((p) => ({ ...p, [chestId]: e.target.value }))}
                  >
                    <option value="">Select item...</option>
                    {LOOT_ITEMS.filter((i) => i.slot !== 'plant' && i.slot !== 'consumable').map((i) => (
                      <option key={i.id} value={i.id}>{i.icon} {i.name}</option>
                    ))}
                  </select>
                  <input
                    className={INPUT + ' w-16'}
                    type="number"
                    placeholder="wt"
                    min={1}
                    value={newItemWeight[chestId] ?? ''}
                    onChange={(e) => setNewItemWeight((p) => ({ ...p, [chestId]: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={() => { addRow(chestId); playClickSound() }}
                    className="px-2.5 py-1.5 rounded-lg bg-cyber-neon/15 border border-cyber-neon/30 text-cyber-neon text-xs hover:bg-cyber-neon/25 transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main AdminDashboard ───────────────────────────────────────────────────────

export function AdminDashboard({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<AdminTab>('items')
  const [cfg, setCfg] = useState<AdminConfig>(() => loadAdminConfig())
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    saveAdminConfig(cfg)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    playClickSound()
  }

  const handleSaveReload = () => {
    saveAdminConfig(cfg)
    window.location.reload()
  }

  const TABS: { id: AdminTab; label: string }[] = [
    { id: 'items', label: 'Items' },
    { id: 'bosses', label: 'Bosses' },
    { id: 'chests', label: 'Chests' },
  ]

  return (
    <motion.div
      initial={MOTION.page.initial}
      animate={MOTION.page.animate}
      exit={MOTION.page.exit}
      className="flex flex-col h-full bg-discord-darker"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-white/5 shrink-0">
        <button
          type="button"
          onClick={() => { onBack(); playClickSound() }}
          className="text-gray-500 hover:text-white transition-colors text-sm"
        >
          ‹ Back
        </button>
        <p className="text-sm font-semibold text-white">Admin Dashboard</p>
        <p className="text-[10px] text-gray-600 ml-auto">Changes apply after reload</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 py-2 border-b border-white/5 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setTab(t.id); playClickSound() }}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === t.id
                ? 'bg-cyber-neon/20 border border-cyber-neon/35 text-cyber-neon'
                : 'text-gray-500 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {tab === 'items' && <ItemsTab cfg={cfg} setCfg={setCfg} />}
        {tab === 'bosses' && <BossesTab cfg={cfg} setCfg={setCfg} />}
        {tab === 'chests' && <ChestsTab cfg={cfg} setCfg={setCfg} />}
      </div>

      {/* Footer save buttons */}
      <div className="flex gap-2 px-4 py-3 border-t border-white/5 shrink-0">
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 py-2 rounded-xl bg-discord-card border border-white/10 text-sm text-white font-semibold hover:border-white/20 transition-colors"
        >
          {saved ? '✓ Saved' : 'Save'}
        </button>
        <button
          type="button"
          onClick={handleSaveReload}
          className="flex-1 py-2 rounded-xl bg-cyber-neon/15 border border-cyber-neon/30 text-cyber-neon text-sm font-semibold hover:bg-cyber-neon/25 transition-colors"
        >
          Save & Reload
        </button>
      </div>
    </motion.div>
  )
}
