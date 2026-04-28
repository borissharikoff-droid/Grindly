import { create } from 'zustand'
import {
  LOOT_ITEMS,
  LOOT_SLOTS,
  POTION_IDS,
  POTION_MAX,
  getChestGoldDrop,
  getEquippedPerkRuntime,
  nextPityAfterChestRoll,
  openChest,
  rollChestDrop,
  isValidItemId,
  type BonusMaterial,
  type ChestType,
  type LootDropContext,
  type LootRollPity,
  type LootSlot,
} from '../lib/loot'
import { useGoldStore } from './goldStore'
import { useAuthStore } from './authStore'
import { track } from '../lib/analytics'
import { getGuildChestDropBonus } from '../lib/guildBuffs'
import { useGuildStore } from './guildStore'

/**
 * Mutex guard: blocks inventory mutations during an active Delve run.
 * Used by `consumePotion` and `salvageItem` (always blocked — abuse vectors
 * even on transition floors).
 *
 * Lazy-required to avoid circular dep with delveStore.
 */
function isDelveActive(): boolean {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const ds = require('./delveStore') as typeof import('./delveStore')
    /* eslint-enable @typescript-eslint/no-require-imports */
    return ds.useDelveStore.getState().activeRun !== null
  } catch {
    return false
  }
}

/**
 * Tighter guard for gear swaps: blocked only during combat phases (wave/boss).
 * On transition phases (rest/rubicon), gear can be changed — and the run's
 * cached playerSnapshot is recomputed via {@link notifyDelveGearChanged}.
 */
function isDelveCombatPhase(): boolean {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const ds = require('./delveStore') as typeof import('./delveStore')
    /* eslint-enable @typescript-eslint/no-require-imports */
    const run = ds.useDelveStore.getState().activeRun
    if (!run) return false
    const kind = run.currentFloorSpec?.kind
    return kind === 'wave' || kind === 'boss'
  } catch {
    return false
  }
}

function notifyDelveGearChanged(): void {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const ds = require('./delveStore') as typeof import('./delveStore')
    /* eslint-enable @typescript-eslint/no-require-imports */
    ds.useDelveStore.getState().recomputeRunStatsFromGear?.()
  } catch {
    /* noop — delve store not available */
  }
}

export interface PendingReward {
  id: string
  createdAt: number
  source: LootDropContext['source']
  chestType: ChestType
  estimatedDropRate: number
  claimed: boolean
}

interface ChestCounts {
  common_chest: number
  rare_chest: number
  epic_chest: number
  legendary_chest: number
}

interface InventoryState {
  items: Record<string, number>
  chests: ChestCounts
  equippedBySlot: Partial<Record<LootSlot, string>>
  pendingRewards: PendingReward[]
  pity: LootRollPity
  lastSkillDropAt: number
  hydrate: () => void
  addChest: (chestType: ChestType, source: LootDropContext['source'], estimatedDropRate?: number) => string
  claimPendingReward: (rewardId: string) => void
  deletePendingReward: (rewardId: string) => void
  claimAllPendingRewards: () => void
  rollSkillGrindDrop: (context: LootDropContext, elapsedSeconds: number) => PendingReward | null
  rollSessionChestDrop: (context: LootDropContext) => { rewardId: string; chestType: ChestType; estimatedDropRate: number }
  openChestAndGrantItem: (chestType: ChestType, context: LootDropContext) => { itemId: string | null; estimatedDropRate: number; goldDropped: number; bonusMaterials: BonusMaterial[] } | null
  /** Grant a chest reward directly (no chest-count guard). Used by quests/bounties. */
  grantAndOpenChest: (chestType: ChestType, context: LootDropContext) => { itemId: string | null; estimatedDropRate: number; goldDropped: number; bonusMaterials: BonusMaterial[] }
  deleteChest: (chestType: ChestType, amount?: number) => void
  equipItem: (itemId: string) => void
  deleteItem: (itemId: string, amount?: number) => void
  /** Salvage one copy of a gear item into materials. Returns the yields, or null if not possible. */
  salvageItem: (itemId: string, yields: Array<{ id: string; qty: number }>) => Array<{ id: string; qty: number }> | null
  unequipSlot: (slot: LootSlot) => void
  addItem: (itemId: string, qty?: number) => void
  /** Add multiple items in a single set() + saveSnapshot() call. Use for bulk operations
   *  (e.g. delve extract) to avoid N localStorage writes. */
  batchAddItems: (items: Array<{ id: string; qty: number }>) => void
  /** Atomic transfer of items OUT of the main inventory (used by delveStore HC stake).
   *  One set() + one saveSnapshot() = crash-safe atomicity. Returns the deducted
   *  items map for delveStore to store in stakedPool.
   *  Rejects if any item qty is insufficient (returns null, no mutation). */
  transferOutForStake: (manifest: Array<{ id: string; qty: number }>) => Record<string, number> | null
  /** Inverse of transferOutForStake — returns items back to main inventory. */
  transferInFromStake: (items: Record<string, number>) => void
  /** Permanently consume a potion, boosting the corresponding stat by 1. Returns false if maxed or not owned. */
  consumePotion: (itemId: string) => boolean
  /** Merge cloud data into local (takes max). Used after sync. */
  mergeFromCloud: (items: Record<string, number>, chests: Record<ChestType, number>) => void
  /** Force-set specific item quantities from cloud (authoritative). Used after trades/marketplace. */
  syncItemsFromCloud: (items: Array<{ item_id: string; quantity: number }>) => void
  permanentStats: { atk: number; hp: number; hpRegen: number; def: number }
}

const STORAGE_KEY = 'grindly_inventory_state_v2'
// Economy: chests from grinding are rare — arena bosses are the primary loot source.
// - cooldown: 3600s (1 hr)
// - base chance: 0.05%/min → ~3% per hour → ~1 chest per 33 hours grinding
const SKILL_DROP_COOLDOWN_MS = 3_600_000
const BASE_DROP_PER_MINUTE = 0.0005


const initialState: Omit<InventoryState, 'hydrate' | 'addItem' | 'batchAddItems' | 'transferOutForStake' | 'transferInFromStake' | 'addChest' | 'claimPendingReward' | 'claimAllPendingRewards' | 'rollSkillGrindDrop' | 'rollSessionChestDrop' | 'openChestAndGrantItem' | 'grantAndOpenChest' | 'equipItem' | 'unequipSlot' | 'mergeFromCloud' | 'syncItemsFromCloud' | 'consumePotion' | 'deletePendingReward' | 'deleteChest' | 'deleteItem' | 'salvageItem'> = {
  items: {},
  chests: {
    common_chest: 0,
    rare_chest: 0,
    epic_chest: 0,
    legendary_chest: 0,
  },
  equippedBySlot: {},
  pendingRewards: [],
  pity: {
    rollsSinceRareChest: 0,
    rollsSinceEpicChest: 0,
    rollsSinceLegendaryChest: 0,
  },
  lastSkillDropAt: 0,
  permanentStats: { atk: 0, hp: 0, hpRegen: 0, def: 0 },
}

function saveSnapshot(state: InventoryState): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        items: state.items,
        chests: state.chests,
        equippedBySlot: state.equippedBySlot,
        pendingRewards: state.pendingRewards,
        pity: state.pity,
        lastSkillDropAt: state.lastSkillDropAt,
        permanentStats: state.permanentStats,
      }),
    )
  } catch {
    // ignore storage failures
  }
}

function readSnapshot(): Partial<typeof initialState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<typeof initialState>
  } catch {
    return null
  }
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  ...initialState,

  hydrate() {
    const snapshot = readSnapshot()
    if (!snapshot) return
    set((state) => {
      const chests = snapshot.chests ?? state.chests
      const pity = snapshot.pity ?? state.pity
      return {
        ...state,
        items: Object.fromEntries(Object.entries(snapshot.items ?? state.items).filter(([id]) => isValidItemId(id))),
        chests: {
          common_chest: chests.common_chest ?? 0,
          rare_chest: chests.rare_chest ?? 0,
          epic_chest: chests.epic_chest ?? 0,
          legendary_chest: chests.legendary_chest ?? 0,
        },
        equippedBySlot: snapshot.equippedBySlot ?? state.equippedBySlot,
        pendingRewards: snapshot.pendingRewards ?? state.pendingRewards,
        pity: {
          rollsSinceRareChest: pity.rollsSinceRareChest ?? 0,
          rollsSinceEpicChest: pity.rollsSinceEpicChest ?? 0,
          rollsSinceLegendaryChest: pity.rollsSinceLegendaryChest ?? 0,
        },
        lastSkillDropAt: snapshot.lastSkillDropAt ?? state.lastSkillDropAt,
        permanentStats: {
          atk: (snapshot as { permanentStats?: { atk?: number } }).permanentStats?.atk ?? 0,
          hp: (snapshot as { permanentStats?: { hp?: number } }).permanentStats?.hp ?? 0,
          hpRegen: (snapshot as { permanentStats?: { hpRegen?: number } }).permanentStats?.hpRegen ?? 0,
          def: (snapshot as { permanentStats?: { def?: number } }).permanentStats?.def ?? 0,
        },
      }
    })
  },

  addChest(chestType, source, estimatedDropRate = 0) {
    const id = crypto.randomUUID()
    set((state) => {
      const next: InventoryState = {
        ...state,
        pendingRewards: [
          ...state.pendingRewards,
          {
            id,
            createdAt: Date.now(),
            source,
            chestType,
            estimatedDropRate,
            claimed: false,
          },
        ],
      }
      saveSnapshot(next)
      return next
    })
    return id
  },

  claimPendingReward(rewardId) {
    set((state) => {
      const reward = state.pendingRewards.find((r) => r.id === rewardId && !r.claimed)
      if (!reward) return state
      const nextChests = { ...state.chests, [reward.chestType]: (state.chests[reward.chestType] ?? 0) + 1 }
      const nextRewards = state.pendingRewards.map((r) => (r.id === rewardId ? { ...r, claimed: true } : r))
      const next: InventoryState = {
        ...state,
        chests: nextChests,
        pendingRewards: nextRewards,
      }
      saveSnapshot(next)
      return next
    })
  },

  deletePendingReward(rewardId) {
    set((state) => {
      const next: InventoryState = {
        ...state,
        pendingRewards: state.pendingRewards.filter((reward) => reward.id !== rewardId),
      }
      saveSnapshot(next)
      return next
    })
  },

  claimAllPendingRewards() {
    set((state) => {
      const nextChests = { ...state.chests }
      const nextRewards = state.pendingRewards.map((reward) => {
        if (!reward.claimed) nextChests[reward.chestType] += 1
        return reward.claimed ? reward : { ...reward, claimed: true }
      })
      const next: InventoryState = {
        ...state,
        chests: nextChests,
        pendingRewards: nextRewards,
      }
      saveSnapshot(next)
      return next
    })
  },

  rollSkillGrindDrop(context, elapsedSeconds) {
    const now = Date.now()
    const state = get()
    const lastDropAt = state.lastSkillDropAt > now ? 0 : state.lastSkillDropAt
    if (now - lastDropAt < SKILL_DROP_COOLDOWN_MS) return null
    if (elapsedSeconds <= 0) return null
    const perk = getEquippedPerkRuntime(state.equippedBySlot)
    const categoryBonus = context.focusCategory ? (perk.chestDropChanceBonusByCategory[context.focusCategory] ?? 0) : 0
    const guildChestBonus = getGuildChestDropBonus(useGuildStore.getState().hallLevel) / 100
    const effectivePerMinute = BASE_DROP_PER_MINUTE * (1 + categoryBonus + guildChestBonus)
    const perSecond = effectivePerMinute / 60
    // Clamp to cooldown window to avoid near-100% chance on first ever roll (lastSkillDropAt=0).
    const sinceLastDrop = lastDropAt > 0 ? Math.floor((now - lastDropAt) / 1000) : SKILL_DROP_COOLDOWN_MS / 1000
    const elapsedForChance = Math.max(elapsedSeconds, Math.min(sinceLastDrop, SKILL_DROP_COOLDOWN_MS / 1000))
    const chance = 1 - Math.pow(1 - perSecond, Math.max(1, elapsedForChance))
    if (Math.random() > chance) return null

    const chestRoll = rollChestDrop(context, state.pity)
    const reward: PendingReward = {
      id: crypto.randomUUID(),
      createdAt: now,
      source: context.source,
      chestType: chestRoll.chestType,
      estimatedDropRate: chestRoll.estimatedDropRate,
      claimed: false,
    }
    const nextState: InventoryState = {
      ...state,
      pity: nextPityAfterChestRoll(chestRoll.chestType, state.pity),
      pendingRewards: [...state.pendingRewards, reward],
      lastSkillDropAt: now,
    }
    set(nextState)
    saveSnapshot(nextState)
    return reward
  },

  rollSessionChestDrop(context) {
    const state = get()
    const chestRoll = rollChestDrop(context, state.pity)
    const rewardId = crypto.randomUUID()
    const reward: PendingReward = {
      id: rewardId,
      createdAt: Date.now(),
      source: context.source,
      chestType: chestRoll.chestType,
      estimatedDropRate: chestRoll.estimatedDropRate,
      claimed: false,
    }
    const nextState: InventoryState = {
      ...state,
      pity: nextPityAfterChestRoll(chestRoll.chestType, state.pity),
      pendingRewards: [...state.pendingRewards, reward],
    }
    set(nextState)
    saveSnapshot(nextState)
    return {
      rewardId,
      chestType: chestRoll.chestType,
      estimatedDropRate: chestRoll.estimatedDropRate,
    }
  },

  openChestAndGrantItem(chestType, context) {
    const state = get()
    if ((state.chests[chestType] ?? 0) <= 0) return null
    const result = openChest(chestType, context)
    const goldAmount = getChestGoldDrop(chestType)
    const nextChests = { ...state.chests, [chestType]: Math.max(0, state.chests[chestType] - 1) }
    const nextItems = { ...state.items }
    if (result.item) {
      nextItems[result.item.id] = (nextItems[result.item.id] ?? 0) + 1
    }
    for (const mat of result.bonusMaterials) {
      nextItems[mat.itemId] = (nextItems[mat.itemId] ?? 0) + mat.qty
    }
    const nextState: InventoryState = {
      ...state,
      chests: nextChests,
      items: nextItems,
    }
    set(nextState)
    saveSnapshot(nextState)
    useGoldStore.getState().addGold(goldAmount)
    const user = useAuthStore.getState().user
    if (user) useGoldStore.getState().syncToSupabase(user.id).catch(() => {})
    return { itemId: result.item?.id ?? null, estimatedDropRate: result.estimatedDropRate, goldDropped: goldAmount, bonusMaterials: result.bonusMaterials }
  },

  grantAndOpenChest(chestType, context) {
    const result = openChest(chestType, context)
    const goldAmount = getChestGoldDrop(chestType)
    set((state) => {
      const nextItems = { ...state.items }
      if (result.item) {
        nextItems[result.item.id] = (nextItems[result.item.id] ?? 0) + 1
      }
      for (const mat of result.bonusMaterials) {
        nextItems[mat.itemId] = (nextItems[mat.itemId] ?? 0) + mat.qty
      }
      const next: InventoryState = { ...state, items: nextItems }
      saveSnapshot(next)
      return next
    })
    useGoldStore.getState().addGold(goldAmount)
    const user = useAuthStore.getState().user
    if (user) useGoldStore.getState().syncToSupabase(user.id).catch(() => {})
    return { itemId: result.item?.id ?? null, estimatedDropRate: result.estimatedDropRate, goldDropped: goldAmount, bonusMaterials: result.bonusMaterials }
  },

  deleteChest(chestType, amount = 1) {
    const qty = Math.max(1, Math.floor(amount))
    set((state) => {
      const next: InventoryState = {
        ...state,
        chests: {
          ...state.chests,
          [chestType]: Math.max(0, (state.chests[chestType] ?? 0) - qty),
        },
      }
      saveSnapshot(next)
      return next
    })
  },

  consumePotion(itemId) {
    if (isDelveActive()) return false
    const state = get()
    const qty = state.items[itemId] ?? 0
    if (qty <= 0) return false
    if (!POTION_IDS.includes(itemId as (typeof POTION_IDS)[number])) return false
    const { permanentStats } = state
    let nextStats: { atk: number; hp: number; hpRegen: number; def: number } | null = null
    if (itemId === 'atk_potion' && permanentStats.atk < POTION_MAX) {
      nextStats = { ...permanentStats, atk: permanentStats.atk + 1 }
    } else if (itemId === 'hp_potion' && permanentStats.hp < POTION_MAX) {
      nextStats = { ...permanentStats, hp: permanentStats.hp + 1 }
    } else if (itemId === 'regen_potion' && permanentStats.hpRegen < POTION_MAX) {
      nextStats = { ...permanentStats, hpRegen: permanentStats.hpRegen + 1 }
    } else if (itemId === 'def_potion' && permanentStats.def < POTION_MAX) {
      nextStats = { ...permanentStats, def: permanentStats.def + 1 }
    }

    // At cap: convert excess potion to 100 gold instead of wasting it
    if (!nextStats) {
      const nextItems = { ...state.items, [itemId]: qty - 1 }
      const nextState: InventoryState = { ...state, items: nextItems }
      set(nextState)
      saveSnapshot(nextState)
      useGoldStore.getState().addGold(100)
      return true
    }

    const nextItems = { ...state.items, [itemId]: qty - 1 }
    const nextState: InventoryState = { ...state, items: nextItems, permanentStats: nextStats }
    set(nextState)
    saveSnapshot(nextState)
    return true
  },

  equipItem(itemId) {
    if (isDelveCombatPhase()) return
    const state = get()
    const qty = state.items[itemId] ?? 0
    if (qty <= 0) return
    const item = LOOT_ITEMS.find((x) => x.id === itemId)
    if (!item || !LOOT_SLOTS.includes(item.slot)) return
    track('item_equip', { item_id: item.id, slot: item.slot, rarity: item.rarity })
    set((prev) => {
      const next: InventoryState = {
        ...prev,
        equippedBySlot: { ...prev.equippedBySlot, [item.slot]: item.id },
      }
      saveSnapshot(next)
      return next
    })
    notifyDelveGearChanged()
  },

  deleteItem(itemId, amount = 1) {
    const qty = Math.max(1, Math.floor(amount))
    set((state) => {
      const current = state.items[itemId] ?? 0
      if (current <= 0) return state
      const nextItems = { ...state.items, [itemId]: Math.max(0, current - qty) }
      // Keep 0-value keys so cloud sync knows the item was consumed locally
      // (deleting the key would let mergeFromCloud restore stale cloud quantities)
      const nextEquipped = { ...state.equippedBySlot }
      for (const [slot, equippedId] of Object.entries(nextEquipped) as Array<[LootSlot, string]>) {
        if (equippedId === itemId && !nextItems[itemId]) {
          delete nextEquipped[slot]
        }
      }
      const next: InventoryState = {
        ...state,
        items: nextItems,
        equippedBySlot: nextEquipped,
      }
      saveSnapshot(next)
      return next
    })
  },

  unequipSlot(slot) {
    if (isDelveCombatPhase()) return
    set((state) => {
      const nextEquipped = { ...state.equippedBySlot }
      delete nextEquipped[slot]
      const next: InventoryState = {
        ...state,
        equippedBySlot: nextEquipped,
      }
      saveSnapshot(next)
      return next
    })
    notifyDelveGearChanged()
  },

  addItem(itemId, qty = 1) {
    const safeQty = Math.max(1, Math.floor(qty))
    set((state) => {
      const next = { ...state, items: { ...state.items, [itemId]: (state.items[itemId] ?? 0) + safeQty } }
      saveSnapshot(next)
      return next
    })
  },

  batchAddItems(items) {
    if (!items.length) return
    set((state) => {
      const newItems = { ...state.items }
      for (const { id, qty } of items) {
        const safeQty = Math.max(1, Math.floor(qty))
        newItems[id] = (newItems[id] ?? 0) + safeQty
      }
      const next = { ...state, items: newItems }
      saveSnapshot(next)
      return next
    })
  },

  transferOutForStake(manifest) {
    if (!manifest.length) return {}
    // Validation pass — reject atomically if anything is short
    const state = get()
    for (const { id, qty } of manifest) {
      const owned = state.items[id] ?? 0
      if (owned < qty) return null
    }
    // Apply
    const deducted: Record<string, number> = {}
    set((s) => {
      const newItems = { ...s.items }
      for (const { id, qty } of manifest) {
        const safeQty = Math.max(1, Math.floor(qty))
        newItems[id] = Math.max(0, (newItems[id] ?? 0) - safeQty)
        deducted[id] = (deducted[id] ?? 0) + safeQty
      }
      const next: InventoryState = { ...s, items: newItems }
      saveSnapshot(next)
      return next
    })
    return deducted
  },

  transferInFromStake(items) {
    const entries = Object.entries(items).filter(([, qty]) => qty > 0)
    if (!entries.length) return
    set((s) => {
      const newItems = { ...s.items }
      for (const [id, qty] of entries) {
        newItems[id] = (newItems[id] ?? 0) + Math.max(0, Math.floor(qty))
      }
      const next: InventoryState = { ...s, items: newItems }
      saveSnapshot(next)
      return next
    })
  },

  salvageItem(itemId, yields) {
    if (isDelveActive()) return null
    const state = get()
    if ((state.items[itemId] ?? 0) < 1) return null
    // Cannot salvage the currently equipped copy
    const allSlots = Object.values(state.equippedBySlot)
    if (allSlots.includes(itemId)) return null
    set((s) => {
      const newItems = { ...s.items }
      // Consume 1 of the item (keep 0-key for sync integrity)
      newItems[itemId] = Math.max(0, (newItems[itemId] ?? 0) - 1)
      // Grant materials
      for (const { id, qty } of yields) {
        newItems[id] = (newItems[id] ?? 0) + qty
      }
      const next: InventoryState = { ...s, items: newItems }
      saveSnapshot(next)
      return next
    })
    return yields
  },

  syncItemsFromCloud(rows) {
    set((state) => {
      const nextItems = { ...state.items }
      for (const { item_id, quantity } of rows) {
        // Defensive: reject non-finite, non-integer, or malformed values from cloud
        if (typeof item_id !== 'string' || !item_id) continue
        if (typeof quantity !== 'number' || !Number.isFinite(quantity)) continue
        const qty = Math.max(0, Math.floor(quantity))
        if (qty <= 0) {
          delete nextItems[item_id]
        } else {
          nextItems[item_id] = qty
        }
      }
      const next: InventoryState = { ...state, items: nextItems }
      saveSnapshot(next)
      return next
    })
  },
  mergeFromCloud(items, chests) {
    set((state) => {
      const nextItems = { ...state.items }
      for (const [itemId, cloudQty] of Object.entries(items)) {
        // Only add items that don't exist locally (admin grants, marketplace purchases).
        // Never override local quantities — local is authoritative for consumed items.
        if (!(itemId in nextItems) && cloudQty > 0) {
          nextItems[itemId] = cloudQty
        }
      }
      // Local is authoritative for chests — use cloud value only if it's strictly greater
      // AND local is currently 0 (handles admin grants without restoring opened chests).
      const nextChests: ChestCounts = {
        common_chest: state.chests.common_chest === 0 && (chests.common_chest ?? 0) > 0 ? chests.common_chest : state.chests.common_chest ?? 0,
        rare_chest: state.chests.rare_chest === 0 && (chests.rare_chest ?? 0) > 0 ? chests.rare_chest : state.chests.rare_chest ?? 0,
        epic_chest: state.chests.epic_chest === 0 && (chests.epic_chest ?? 0) > 0 ? chests.epic_chest : state.chests.epic_chest ?? 0,
        legendary_chest: state.chests.legendary_chest === 0 && (chests.legendary_chest ?? 0) > 0 ? chests.legendary_chest : state.chests.legendary_chest ?? 0,
      }
      const next: InventoryState = { ...state, items: nextItems, chests: nextChests }
      saveSnapshot(next)
      return next
    })
  },
}))

// The store uses lazy hydrate so callers can control when localStorage is read.
export function ensureInventoryHydrated(): void {
  useInventoryStore.getState().hydrate()
}
