import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  PETS,
  ADVENTURES,
  PET_ROLL_COST,
  rollName,
  rollRarity,
  rollAdventureReward,
  rollPetSessionDrop,
  computeCurrentHunger,
  xpToNextLevel,
  getFoodFeedValue,
  getPetMilestoneQuote,
  type PetInstance,
  type AdventureReward,
} from '../lib/pets'
import { SKILLS } from '../lib/skills'
import { useGoldStore } from './goldStore'
import { useInventoryStore } from './inventoryStore'
import { LOOT_ITEMS } from '../lib/loot'
import type { LootRarity } from '../lib/loot'

interface PetStore {
  activePet: PetInstance | null
  /** Roll a new pet. Free on first roll; costs PET_ROLL_COST gold on re-rolls.
   *  Pass speciesId to pick a specific species (used by starter chooser).
   *  Pass assignedSkillId to set which skill the pet buffs (for dynamic-buff starters). */
  rollPet: (options?: { speciesId?: string; assignedSkillId?: string }) => { success: boolean; error?: string }
  /** Feed one unit of the given food item to the active pet. */
  feedPet: (itemId: string) => { success: boolean; leveledUp: boolean; error?: string }
  /** Rename the active pet (max 20 chars). */
  renamePet: (name: string) => void
  /** Send pet on a timed adventure. Pet gives no buff while away. */
  sendOnAdventure: (adventureId: string) => { success: boolean; error?: string }
  /** Collect the result of a completed adventure. Returns reward, narrative, or error. */
  collectAdventure: () => { success: boolean; reward?: AdventureReward; narrative?: string; error?: string }
  /** Cancel an in-progress adventure (no reward). */
  cancelAdventure: () => void
  /** Lv3 ability (24h cooldown): pet finds 1–3 common materials instantly. */
  useScavenge: () => { success: boolean; materials?: Array<{ id: string; qty: number }>; error?: string }
  /** Lv6 ability (7-day cooldown): activate +50% XP for 20 min. */
  activateMotivationBurst: () => { success: boolean; error?: string }
  /** Pet the active pet (max 10/day). Grants +1 XP, +2 hunger, activates playful mood. */
  petPet: () => { success: boolean; xp?: number; leveledUp?: boolean; error?: string }
  /** Reassign which skill the pet buffs. Pass 'all' to buff every skill. */
  reassignSkill: (skillId: string) => void
  /** Check and grant any newly-reached bond milestones. Returns unlocked ids. */
  checkBondMilestones: () => string[]
  /** If set, a celebration overlay should be shown for this milestone. */
  pendingCelebration: { milestoneId: string; quote: string } | null
  clearPendingCelebration: () => void
  /**
   * Called at session end. If conditions met, drops 1 material and returns its id + name.
   * Returns null if no drop (no pet, pet dead, session too short).
   */
  grantSessionDrop: (elapsedSeconds: number) => { materialId: string } | null
}

const MAT_COMMON_SCAVENGE = ['slime_gel', 'goblin_tooth', 'ore_iron', 'monster_fang']
const _pickArr = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]

export const usePetStore = create<PetStore>()(
  persist(
    (set, get) => ({
      activePet: null,
      pendingCelebration: null,

      rollPet(options?: { speciesId?: string; assignedSkillId?: string }) {
        const isFirstRoll = get().activePet === null
        const cost = isFirstRoll ? 0 : PET_ROLL_COST
        if (!isFirstRoll && useGoldStore.getState().gold < cost) {
          return { success: false, error: 'Not enough gold' }
        }

        let def = options?.speciesId
          ? PETS.find((p) => p.id === options.speciesId)
          : (() => {
              // Weighted roll by rarity — re-rolls only (first roll is always starter)
              const rarity = rollRarity()
              const pool = PETS.filter((p) => p.rarity === rarity)
              return pool.length > 0
                ? pool[Math.floor(Math.random() * pool.length)]
                : PETS[Math.floor(Math.random() * PETS.length)]
            })()

        if (!def) return { success: false, error: 'Roll failed' }

        const instance: PetInstance = {
          defId: def.id,
          customName: rollName(def.id),
          level: 1,
          xp: 0,
          hungerSnapshot: 100,
          lastFedAt: Date.now(),
          rolledAt: Date.now(),
          totalFeedings: 0,
          assignedSkillId: options?.assignedSkillId,
          adventureId: null,
          adventureStartedAt: null,
          scavengeLastUsedAt: null,
          motivationBurstActiveUntil: null,
          motivationBurstLastUsedAt: null,
          bondMilestonesUnlocked: [],
          buffBonus: 0,
          hasEvolvedEmoji: false,
        }

        if (!isFirstRoll) {
          useGoldStore.getState().addGold(-cost)
        }

        set({ activePet: instance })
        return { success: true }
      },

      feedPet(itemId: string) {
        const { activePet } = get()
        if (!activePet) return { success: false, leveledUp: false, error: 'No pet' }

        const items = useInventoryStore.getState().items
        if ((items[itemId] ?? 0) <= 0) {
          return { success: false, leveledUp: false, error: 'Item not in inventory' }
        }

        const itemDef = LOOT_ITEMS.find((i) => i.id === itemId)
        const rarity: LootRarity = (itemDef?.rarity ?? 'common') as LootRarity
        const { hungerRestore, petXp } = getFoodFeedValue(rarity)

        const currentHunger = computeCurrentHunger(activePet)
        if (currentHunger >= 100) {
          return { success: false, leveledUp: false, error: 'Already full' }
        }

        useInventoryStore.getState().deleteItem(itemId, 1)

        const newHunger = Math.min(100, currentHunger + hungerRestore)
        const newXp = activePet.xp + petXp
        const needed = xpToNextLevel(activePet.level)
        const leveledUp = activePet.level < 10 && newXp >= needed

        const now = Date.now()
        const newPet: PetInstance = {
          ...activePet,
          level: leveledUp ? activePet.level + 1 : activePet.level,
          xp: leveledUp ? newXp - needed : newXp,
          hungerSnapshot: newHunger,
          lastFedAt: now,
          totalFeedings: (activePet.totalFeedings ?? 0) + 1,
          playfulUntil: now + 30 * 60_000,
          lastInteractedAt: now,
        }

        set({ activePet: newPet })
        get().checkBondMilestones()
        return { success: true, leveledUp }
      },

      renamePet(name: string) {
        const { activePet } = get()
        if (!activePet) return
        set({ activePet: { ...activePet, customName: name.trim().slice(0, 20) || null } })
      },

      sendOnAdventure(adventureId: string) {
        const { activePet } = get()
        if (!activePet) return { success: false, error: 'No pet' }
        if (activePet.adventureId) return { success: false, error: 'Already on adventure' }

        const adventureDef = ADVENTURES.find((a) => a.id === adventureId)
        if (!adventureDef) return { success: false, error: 'Unknown adventure' }
        if (activePet.level < adventureDef.minLevel) {
          return { success: false, error: `Requires LVL ${adventureDef.minLevel}` }
        }

        const hunger = computeCurrentHunger(activePet)
        if (hunger < 25) return { success: false, error: 'Pet is too hungry to go on adventure' }

        set({ activePet: { ...activePet, adventureId, adventureStartedAt: Date.now() } })
        return { success: true }
      },

      collectAdventure() {
        const { activePet } = get()
        if (!activePet?.adventureId || !activePet.adventureStartedAt) {
          return { success: false, error: 'No active adventure' }
        }

        const adventureDef = ADVENTURES.find((a) => a.id === activePet.adventureId)
        if (!adventureDef) return { success: false, error: 'Unknown adventure' }

        const elapsed = Date.now() - activePet.adventureStartedAt
        if (elapsed < adventureDef.durationMs) {
          return { success: false, error: 'Adventure not finished yet' }
        }

        const reward = rollAdventureReward(activePet.adventureId)

        for (const mat of reward.materials) {
          useInventoryStore.getState().addItem(mat.id, mat.qty)
        }
        useGoldStore.getState().addGold(reward.gold)

        const petName = activePet.customName ?? adventureDef.label
        const narrative = `${petName} ${adventureDef.narrativeResult} and returned safely.`

        set({ activePet: { ...activePet, adventureId: null, adventureStartedAt: null } })
        return { success: true, reward, narrative }
      },

      cancelAdventure() {
        const { activePet } = get()
        if (!activePet) return
        set({ activePet: { ...activePet, adventureId: null, adventureStartedAt: null } })
      },

      useScavenge() {
        const { activePet } = get()
        if (!activePet) return { success: false, error: 'No pet' }
        if (activePet.level < 3) return { success: false, error: 'Requires LVL 3' }
        if (activePet.adventureId) return { success: false, error: 'Pet is on adventure' }

        const now = Date.now()
        const lastUsed = activePet.scavengeLastUsedAt ?? 0
        if (now - lastUsed < 24 * 3_600_000) return { success: false, error: 'On cooldown (24h)' }

        const count = 1 + Math.floor(Math.random() * 3)  // 1–3
        const materials: Array<{ id: string; qty: number }> = []
        for (let i = 0; i < count; i++) {
          const id = _pickArr(MAT_COMMON_SCAVENGE)
          const existing = materials.find((m) => m.id === id)
          if (existing) existing.qty++
          else materials.push({ id, qty: 1 })
        }

        for (const mat of materials) {
          useInventoryStore.getState().addItem(mat.id, mat.qty)
        }

        set({ activePet: { ...activePet, scavengeLastUsedAt: now } })
        return { success: true, materials }
      },

      activateMotivationBurst() {
        const { activePet } = get()
        if (!activePet) return { success: false, error: 'No pet' }
        if (activePet.level < 6) return { success: false, error: 'Requires LVL 6' }
        if (activePet.adventureId) return { success: false, error: 'Pet is on adventure' }

        const now = Date.now()
        const lastUsed = activePet.motivationBurstLastUsedAt ?? 0
        if (now - lastUsed < 3 * 24 * 3_600_000) return { success: false, error: 'On cooldown (3 days)' }

        const activeUntil = now + 20 * 60 * 1_000  // 20 minutes
        set({
          activePet: {
            ...activePet,
            motivationBurstActiveUntil: activeUntil,
            motivationBurstLastUsedAt: now,
          },
        })
        return { success: true }
      },

      petPet() {
        const { activePet } = get()
        if (!activePet) return { success: false, error: 'No pet' }
        if (activePet.adventureId) return { success: false, error: 'Pet is on adventure' }

        const hunger = computeCurrentHunger(activePet)
        if (hunger === 0) return { success: false, error: 'Feed your pet first' }

        const today = new Date().toDateString()
        const pettedCount = activePet.pettedDate === today ? (activePet.pettedCount ?? 0) : 0
        if (pettedCount >= 10) return { success: false, error: 'Already played today (10/10)' }

        const now = Date.now()
        const newXp = activePet.xp + 1
        const needed = xpToNextLevel(activePet.level)
        const leveledUp = activePet.level < 10 && newXp >= needed
        const newHunger = Math.min(100, hunger + 2)

        const newPet: PetInstance = {
          ...activePet,
          level: leveledUp ? activePet.level + 1 : activePet.level,
          xp: leveledUp ? newXp - needed : newXp,
          hungerSnapshot: newHunger,
          lastFedAt: now, // update snapshot base
          playfulUntil: now + 30 * 60_000,
          lastInteractedAt: now,
          pettedCount: pettedCount + 1,
          pettedDate: today,
        }
        set({ activePet: newPet })
        if (leveledUp) get().checkBondMilestones()
        return { success: true, xp: 1, leveledUp }
      },

      reassignSkill(skillId: string) {
        const { activePet } = get()
        if (!activePet) return
        // 'all' resets to species default (unset assignedSkillId)
        const validSkill = skillId === 'all' || SKILLS.some((s) => s.id === skillId)
        if (!validSkill) return
        set({
          activePet: {
            ...activePet,
            assignedSkillId: skillId === 'all' ? undefined : skillId,
          },
        })
      },

      checkBondMilestones() {
        const { activePet } = get()
        if (!activePet) return []

        const now = Date.now()
        const unlocked = activePet.bondMilestonesUnlocked ?? []
        const newlyUnlocked: string[] = []

        const tryUnlock = (id: string, cond: boolean) => {
          if (cond && !unlocked.includes(id)) newlyUnlocked.push(id)
        }

        const daysTogether = (now - activePet.rolledAt) / (24 * 3_600_000)
        tryUnlock('day7',   daysTogether >= 7)
        tryUnlock('day30',  daysTogether >= 30)
        tryUnlock('feed50', (activePet.totalFeedings ?? 0) >= 50)
        tryUnlock('feed100',(activePet.totalFeedings ?? 0) >= 100)
        tryUnlock('lv10',   activePet.level >= 10)

        if (newlyUnlocked.length === 0) return []

        let nextPet: PetInstance = {
          ...activePet,
          bondMilestonesUnlocked: [...unlocked, ...newlyUnlocked],
        }

        if (newlyUnlocked.includes('day30')) {
          nextPet = { ...nextPet, buffBonus: (nextPet.buffBonus ?? 0) + 1 }
        }
        if (newlyUnlocked.includes('lv10')) {
          nextPet = { ...nextPet, hasEvolvedEmoji: true }
        }
        if (newlyUnlocked.includes('feed50')) {
          useInventoryStore.getState().addItem('food_apple_pie', 1)
        }
        if (newlyUnlocked.includes('feed100')) {
          useInventoryStore.getState().addItem('legendary_chest', 1)
        }

        set({
          activePet: nextPet,
          pendingCelebration: {
            milestoneId: newlyUnlocked[0],
            quote: getPetMilestoneQuote(nextPet.defId, newlyUnlocked[0]),
          },
        })
        return newlyUnlocked
      },

      clearPendingCelebration() {
        set({ pendingCelebration: null })
      },

      grantSessionDrop(elapsedSeconds: number) {
        const { activePet } = get()
        if (!activePet) return null
        if (elapsedSeconds < 5 * 60) return null  // minimum 5-minute session
        const hunger = computeCurrentHunger(activePet)
        if (hunger === 0) return null  // dead pets don't find stuff
        if (activePet.adventureId) return null  // out adventuring

        const materialId = rollPetSessionDrop(activePet.level)
        useInventoryStore.getState().addItem(materialId, 1)
        return { materialId }
      },
    }),
    {
      name: 'grindly_pet_v1',
      partialize: (s) => ({ activePet: s.activePet }),
    }
  )
)
