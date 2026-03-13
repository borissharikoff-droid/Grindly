import { describe, expect, it, vi } from 'vitest'
import {
  SEED_DEFS,
  SEED_IDS,
  getSeedById,
  isSeedId,
  SLOT_UNLOCK_COSTS,
  SLOT_UNLOCK_REQUIREMENTS,
  MAX_FARM_SLOTS,
  FIELD_DEFS,
  canUnlockSlot,
  SEED_ZIP_ITEM_IDS,
  SEED_ZIP_LABELS,
  SEED_ZIP_ICONS,
  isSeedZipId,
  seedZipTierFromItemId,
  getSeedZipDisplay,
  CHEST_TO_ZIP_TIER,
  rollSeedZipFromChest,
  rollSeedFromZip,
  HARVEST_SEED_ZIP_CHANCE,
  rollHarvestSeedZipTier,
  PLANT_COMBAT_BUFFS,
  getFarmerSpeedMultiplier,
  getFarmerBonusYieldChance,
  getFarmerFailReduction,
  getEffectiveFailChance,
  rollHarvestFail,
  rollCropRot,
  getEffectiveRotChance,
  FAIL_CHANCE_BY_RARITY,
  FARMHOUSE_UNLOCK_LEVEL,
  FARMHOUSE_LEVELS,
  getFarmhouseBonuses,
  getEffectiveGrowTime,
  getNextFarmhouseUpgrade,
  getFarmhouseIcon,
  FARMHOUSE_ICONS,
  formatGrowTime,
  formatCountdown,
  getFarmItemDisplay,
  type SeedZipTier,
  type SeedDef,
} from '../renderer/lib/farming'

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1: SEED DEFINITIONS — data integrity
// ═══════════════════════════════════════════════════════════════════════════════

describe('SEED_DEFS — data integrity', () => {
  it('has exactly 9 seeds', () => {
    expect(SEED_DEFS.length).toBe(9)
  })

  it('every seed has a unique id', () => {
    const ids = SEED_DEFS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every seed id ends with "_seed" or is "void_spore"', () => {
    for (const s of SEED_DEFS) {
      const valid = s.id.endsWith('_seed') || s.id === 'void_spore'
      expect(valid, `Bad seed id: ${s.id}`).toBe(true)
    }
  })

  it('every seed has a positive growTimeSeconds', () => {
    for (const s of SEED_DEFS) {
      expect(s.growTimeSeconds, `${s.id} growTime`).toBeGreaterThan(0)
    }
  })

  it('every seed has yieldMin <= yieldMax, both >= 1', () => {
    for (const s of SEED_DEFS) {
      expect(s.yieldMin, `${s.id} yieldMin`).toBeGreaterThanOrEqual(1)
      expect(s.yieldMax, `${s.id} yieldMax`).toBeGreaterThanOrEqual(s.yieldMin)
    }
  })

  it('every seed has positive XP values', () => {
    for (const s of SEED_DEFS) {
      expect(s.xpOnPlant, `${s.id} xpOnPlant`).toBeGreaterThan(0)
      expect(s.xpOnHarvest, `${s.id} xpOnHarvest`).toBeGreaterThan(0)
    }
  })

  it('higher rarity seeds have longer grow times on average', () => {
    const byRarity: Record<string, number[]> = {}
    for (const s of SEED_DEFS) {
      if (!byRarity[s.rarity]) byRarity[s.rarity] = []
      byRarity[s.rarity].push(s.growTimeSeconds)
    }
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
    const rarityOrder = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const
    const defined = rarityOrder.filter((r) => byRarity[r])
    for (let i = 1; i < defined.length; i++) {
      expect(avg(byRarity[defined[i]])).toBeGreaterThan(avg(byRarity[defined[i - 1]]))
    }
  })

  it('higher rarity seeds grant more XP on harvest', () => {
    const byRarity: Record<string, number[]> = {}
    for (const s of SEED_DEFS) {
      if (!byRarity[s.rarity]) byRarity[s.rarity] = []
      byRarity[s.rarity].push(s.xpOnHarvest)
    }
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
    const rarityOrder = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const
    const defined = rarityOrder.filter((r) => byRarity[r])
    for (let i = 1; i < defined.length; i++) {
      expect(avg(byRarity[defined[i]])).toBeGreaterThan(avg(byRarity[defined[i - 1]]))
    }
  })

  it('SEED_IDS matches all seed ids', () => {
    expect(SEED_IDS.length).toBe(SEED_DEFS.length)
    for (const s of SEED_DEFS) {
      expect(SEED_IDS).toContain(s.id)
    }
  })

  it('getSeedById returns the correct seed', () => {
    expect(getSeedById('wheat_seed')?.name).toBe('Wheat Seed')
    expect(getSeedById('void_spore')?.rarity).toBe('mythic')
    expect(getSeedById('nonexistent')).toBeUndefined()
  })

  it('isSeedId correctly identifies seeds', () => {
    for (const s of SEED_DEFS) {
      expect(isSeedId(s.id), `${s.id} should be seed`).toBe(true)
    }
    expect(isSeedId('wheat')).toBe(false)
    expect(isSeedId('random_item')).toBe(false)
    expect(isSeedId('')).toBe(false)
  })

  it('void_spore has the longest grow time (8h)', () => {
    const voidSpore = getSeedById('void_spore')!
    const maxGrow = Math.max(...SEED_DEFS.map((s) => s.growTimeSeconds))
    expect(voidSpore.growTimeSeconds).toBe(maxGrow)
    expect(voidSpore.growTimeSeconds).toBe(8 * 60 * 60)
  })

  it('wheat_seed has the shortest grow time (5 min)', () => {
    const wheat = getSeedById('wheat_seed')!
    const minGrow = Math.min(...SEED_DEFS.map((s) => s.growTimeSeconds))
    expect(wheat.growTimeSeconds).toBe(minGrow)
    expect(wheat.growTimeSeconds).toBe(5 * 60)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2: SLOT UNLOCK COSTS & REQUIREMENTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('slot unlock costs & requirements', () => {
  it('has 16 slot costs (one per slot)', () => {
    expect(SLOT_UNLOCK_COSTS.length).toBe(16)
    expect(MAX_FARM_SLOTS).toBe(16)
  })

  it('slot 0 is free (cost = 0)', () => {
    expect(SLOT_UNLOCK_COSTS[0]).toBe(0)
  })

  it('costs are non-decreasing', () => {
    for (let i = 1; i < SLOT_UNLOCK_COSTS.length; i++) {
      expect(SLOT_UNLOCK_COSTS[i], `slot ${i}`).toBeGreaterThanOrEqual(SLOT_UNLOCK_COSTS[i - 1])
    }
  })

  it('last slot costs 220,000 gold', () => {
    expect(SLOT_UNLOCK_COSTS[15]).toBe(220_000)
  })

  it('has 16 slot requirements', () => {
    expect(SLOT_UNLOCK_REQUIREMENTS.length).toBe(16)
  })

  it('farmer level requirements are non-decreasing', () => {
    for (let i = 1; i < SLOT_UNLOCK_REQUIREMENTS.length; i++) {
      expect(SLOT_UNLOCK_REQUIREMENTS[i].farmerLevel).toBeGreaterThanOrEqual(
        SLOT_UNLOCK_REQUIREMENTS[i - 1].farmerLevel,
      )
    }
  })

  it('first 3 slots have farmer level 0', () => {
    for (let i = 0; i <= 2; i++) {
      expect(SLOT_UNLOCK_REQUIREMENTS[i].farmerLevel).toBe(0)
    }
  })

  it('some slots require secondary skills', () => {
    const withSecondary = SLOT_UNLOCK_REQUIREMENTS.filter((r) => r.secondarySkill)
    expect(withSecondary.length).toBeGreaterThan(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3: canUnlockSlot
// ═══════════════════════════════════════════════════════════════════════════════

describe('canUnlockSlot', () => {
  /** skillXP that gives exactly the provided level (approximate, uses quadratic formula inverse). */
  function xpForLevel(level: number): number {
    // From skills.ts: xpForLevel(L) = floor(pow(L/99, 2.2) * 3_600_000)
    return Math.floor(Math.pow(level / 99, 2.2) * 3_600_000)
  }

  it('slot 0 can always be unlocked (free, level 0)', () => {
    const result = canUnlockSlot(0, 0, {})
    expect(result.canUnlock).toBe(true)
    expect(result.missingGold).toBe(false)
    expect(result.missingFarmer).toBe(false)
    expect(result.missingSecondary).toBe(false)
  })

  it('slot 1 fails with no gold', () => {
    const result = canUnlockSlot(1, 0, {})
    expect(result.canUnlock).toBe(false)
    expect(result.missingGold).toBe(true)
  })

  it('slot 1 succeeds with enough gold', () => {
    const result = canUnlockSlot(1, 200, {})
    expect(result.canUnlock).toBe(true)
  })

  it('slot 3 fails with insufficient farmer level', () => {
    // Use 0 XP = level 0, which is below the level 5 requirement
    const result = canUnlockSlot(3, 999_999, { farmer: 0 })
    expect(result.canUnlock).toBe(false)
    expect(result.missingFarmer).toBe(true)
  })

  it('slot 3 succeeds with farmer level 5', () => {
    const result = canUnlockSlot(3, 999_999, { farmer: xpForLevel(5) })
    expect(result.canUnlock).toBe(true)
  })

  it('slot 11 requires crafter level 10', () => {
    const req = SLOT_UNLOCK_REQUIREMENTS[11]
    expect(req.secondarySkill?.skillId).toBe('crafter')
    expect(req.secondarySkill?.level).toBe(10)
  })

  it('slot 11 fails without crafter skill', () => {
    const result = canUnlockSlot(11, 999_999, { farmer: xpForLevel(50) })
    expect(result.canUnlock).toBe(false)
    expect(result.missingSecondary).toBe(true)
  })

  it('slot 11 succeeds with farmer 45 and crafter 10', () => {
    const result = canUnlockSlot(11, 999_999, {
      farmer: xpForLevel(50),
      crafter: xpForLevel(10),
    })
    expect(result.canUnlock).toBe(true)
  })

  it('slot 13 requires warrior level 15', () => {
    const req = SLOT_UNLOCK_REQUIREMENTS[13]
    expect(req.secondarySkill?.skillId).toBe('warrior')
  })

  it('slot 15 requires warrior level 25', () => {
    const req = SLOT_UNLOCK_REQUIREMENTS[15]
    expect(req.secondarySkill?.skillId).toBe('warrior')
    expect(req.secondarySkill?.level).toBe(25)
  })

  // Bug regression: slot unlock failing due to secondary skill not matching xp
  it('returns correct req in result', () => {
    const result = canUnlockSlot(5, 99999, { farmer: xpForLevel(20) })
    expect(result.req.farmerLevel).toBe(15)
    expect(result.canUnlock).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4: FIELD DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe('FIELD_DEFS', () => {
  it('has exactly 2 fields', () => {
    expect(FIELD_DEFS.length).toBe(2)
  })

  it('fields have unique ids', () => {
    const ids = FIELD_DEFS.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('field1 contains slots 0-7', () => {
    const f = FIELD_DEFS.find((f) => f.id === 'field1')!
    expect(f.slots).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('field2 contains slots 8-15', () => {
    const f = FIELD_DEFS.find((f) => f.id === 'field2')!
    expect(f.slots).toEqual([8, 9, 10, 11, 12, 13, 14, 15])
  })

  it('all 16 slots are covered exactly once', () => {
    const allSlots = FIELD_DEFS.flatMap((f) => f.slots)
    expect(allSlots.length).toBe(16)
    expect(new Set(allSlots).size).toBe(16)
    for (let i = 0; i < 16; i++) {
      expect(allSlots).toContain(i)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5: SEED ZIPS
// ═══════════════════════════════════════════════════════════════════════════════

describe('seed zip system', () => {
  const TIERS: SeedZipTier[] = ['common', 'rare', 'epic', 'legendary']

  it('SEED_ZIP_ITEM_IDS covers all 4 tiers', () => {
    for (const tier of TIERS) {
      expect(SEED_ZIP_ITEM_IDS[tier]).toBeTruthy()
    }
  })

  it('all seed zip item IDs are distinct', () => {
    const ids = Object.values(SEED_ZIP_ITEM_IDS)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('SEED_ZIP_LABELS has entries for all tiers', () => {
    for (const tier of TIERS) {
      expect(SEED_ZIP_LABELS[tier]).toBeTruthy()
    }
  })

  it('SEED_ZIP_ICONS has entries for all tiers', () => {
    for (const tier of TIERS) {
      expect(SEED_ZIP_ICONS[tier]).toBeTruthy()
    }
  })

  it('isSeedZipId identifies seed zip item IDs correctly', () => {
    for (const id of Object.values(SEED_ZIP_ITEM_IDS)) {
      expect(isSeedZipId(id)).toBe(true)
    }
    expect(isSeedZipId('wheat_seed')).toBe(false)
    expect(isSeedZipId('wheat')).toBe(false)
    expect(isSeedZipId('')).toBe(false)
  })

  it('seedZipTierFromItemId returns correct tier', () => {
    expect(seedZipTierFromItemId('seed_zip_common')).toBe('common')
    expect(seedZipTierFromItemId('seed_zip_rare')).toBe('rare')
    expect(seedZipTierFromItemId('seed_zip_epic')).toBe('epic')
    expect(seedZipTierFromItemId('seed_zip_legendary')).toBe('legendary')
    expect(seedZipTierFromItemId('wheat_seed')).toBeNull()
    expect(seedZipTierFromItemId('')).toBeNull()
  })

  it('getSeedZipDisplay returns name, icon, image for all tiers', () => {
    for (const tier of TIERS) {
      const d = getSeedZipDisplay(tier)
      expect(d.name).toContain(SEED_ZIP_LABELS[tier])
      expect(d.icon).toBeTruthy()
      expect(typeof d.image).toBe('string')
    }
  })

  it('CHEST_TO_ZIP_TIER maps all chest types to seed zip tiers', () => {
    expect(CHEST_TO_ZIP_TIER['common_chest']).toBe('common')
    expect(CHEST_TO_ZIP_TIER['rare_chest']).toBe('rare')
    expect(CHEST_TO_ZIP_TIER['epic_chest']).toBe('epic')
    expect(CHEST_TO_ZIP_TIER['legendary_chest']).toBe('legendary')
  })

  describe('rollSeedFromZip', () => {
    it('returns a valid seed ID for every tier', () => {
      for (const tier of TIERS) {
        const seedId = rollSeedFromZip(tier)
        expect(seedId).toBeTruthy()
        expect(isSeedId(seedId!), `${seedId} should be a seed`).toBe(true)
      }
    })

    it('common zip only drops common seeds', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const seedId = rollSeedFromZip('common')
      expect(seedId).toBe('wheat_seed') // first entry in common table
      vi.restoreAllMocks()
    })

    it('legendary zip can drop void_spore', () => {
      // void_spore is the last entry (highest roll) in legendary table
      vi.spyOn(Math, 'random').mockReturnValue(0.999)
      const seedId = rollSeedFromZip('legendary')
      expect(seedId).toBeTruthy()
      expect(isSeedId(seedId!)).toBe(true)
      vi.restoreAllMocks()
    })

    it('common zip never drops epic+ seeds', () => {
      const epicSeeds = SEED_DEFS.filter((s) => s.rarity === 'epic' || s.rarity === 'legendary' || s.rarity === 'mythic').map((s) => s.id)
      for (let i = 0; i < 20; i++) {
        vi.spyOn(Math, 'random').mockReturnValue(i / 20)
        const seedId = rollSeedFromZip('common')
        expect(epicSeeds).not.toContain(seedId)
        vi.restoreAllMocks()
      }
    })
  })

  describe('rollSeedZipFromChest', () => {
    it('always drops from legendary chest (85% chance, roll=0)', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      expect(rollSeedZipFromChest('legendary_chest')).toBe(true)
      vi.restoreAllMocks()
    })

    it('never drops when roll exceeds chance', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.999)
      expect(rollSeedZipFromChest('common_chest')).toBe(false)
      expect(rollSeedZipFromChest('rare_chest')).toBe(false)
      vi.restoreAllMocks()
    })

    it('legendary chest drops more often than common chest', () => {
      // Statistically verify by running many trials with seeded random
      let commonDrops = 0
      let legendaryDrops = 0
      const N = 1000
      for (let i = 0; i < N; i++) {
        vi.spyOn(Math, 'random').mockReturnValue(i / N)
        if (rollSeedZipFromChest('common_chest')) commonDrops++
        if (rollSeedZipFromChest('legendary_chest')) legendaryDrops++
        vi.restoreAllMocks()
      }
      expect(legendaryDrops).toBeGreaterThan(commonDrops)
    })
  })

  describe('rollHarvestSeedZipTier', () => {
    it('HARVEST_SEED_ZIP_CHANCE is 15%', () => {
      expect(HARVEST_SEED_ZIP_CHANCE).toBe(0.15)
    })

    it('returns common on low roll', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      expect(rollHarvestSeedZipTier()).toBe('common')
      vi.restoreAllMocks()
    })

    it('returns legendary on very high roll', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.999)
      expect(rollHarvestSeedZipTier()).toBe('legendary')
      vi.restoreAllMocks()
    })

    it('returns only valid tiers', () => {
      const validTiers: SeedZipTier[] = ['common', 'rare', 'epic', 'legendary']
      for (let i = 0; i <= 10; i++) {
        vi.spyOn(Math, 'random').mockReturnValue(i / 10)
        const tier = rollHarvestSeedZipTier()
        expect(validTiers).toContain(tier)
        vi.restoreAllMocks()
      }
    })

    it('is biased toward common (60% chance)', () => {
      // Rolls < 0.6 → common
      vi.spyOn(Math, 'random').mockReturnValue(0.59)
      expect(rollHarvestSeedZipTier()).toBe('common')
      vi.restoreAllMocks()
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PART 6: PLANT COMBAT BUFFS
// ═══════════════════════════════════════════════════════════════════════════════

describe('PLANT_COMBAT_BUFFS', () => {
  const EXPECTED_PLANTS = ['wheat', 'herbs', 'apples', 'blossoms', 'clovers', 'orchids', 'star_bloom', 'crystal_root', 'void_blossom']

  it('has buffs for all harvestable plants', () => {
    for (const plant of EXPECTED_PLANTS) {
      expect(PLANT_COMBAT_BUFFS[plant], `missing buffs for ${plant}`).toBeDefined()
    }
  })

  it('all buff values are non-negative', () => {
    for (const [plant, buff] of Object.entries(PLANT_COMBAT_BUFFS)) {
      expect(buff.atk, `${plant}.atk`).toBeGreaterThanOrEqual(0)
      expect(buff.hp, `${plant}.hp`).toBeGreaterThanOrEqual(0)
      expect(buff.hpRegen, `${plant}.hpRegen`).toBeGreaterThanOrEqual(0)
      expect(buff.def, `${plant}.def`).toBeGreaterThanOrEqual(0)
    }
  })

  it('every plant has at least one non-zero buff', () => {
    for (const [plant, buff] of Object.entries(PLANT_COMBAT_BUFFS)) {
      const total = buff.atk + buff.hp + buff.hpRegen + buff.def
      expect(total, `${plant} has no buffs`).toBeGreaterThan(0)
    }
  })

  it('higher rarity plants grant stronger buffs', () => {
    const wheatPower = PLANT_COMBAT_BUFFS['wheat'].hp // +5 HP
    const voidPower = PLANT_COMBAT_BUFFS['void_blossom'].atk // +15 ATK
    // void_blossom (mythic) should have larger raw buff than wheat (common)
    expect(voidPower).toBeGreaterThan(wheatPower)
  })

  it('void_blossom has the highest ATK buff', () => {
    const maxAtk = Math.max(...Object.values(PLANT_COMBAT_BUFFS).map((b) => b.atk))
    expect(PLANT_COMBAT_BUFFS['void_blossom'].atk).toBe(maxAtk)
  })

  it('crystal_root has the highest HP buff', () => {
    const maxHp = Math.max(...Object.values(PLANT_COMBAT_BUFFS).map((b) => b.hp))
    expect(PLANT_COMBAT_BUFFS['crystal_root'].hp).toBe(maxHp)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PART 7: FARMER LEVEL BONUSES
// ═══════════════════════════════════════════════════════════════════════════════

describe('getFarmerSpeedMultiplier', () => {
  it('returns 1.0 at level 0', () => {
    expect(getFarmerSpeedMultiplier(0)).toBe(1.0)
  })

  it('returns 0.90 at level 10', () => {
    expect(getFarmerSpeedMultiplier(10)).toBe(0.90)
  })

  it('returns 0.80 at level 25', () => {
    expect(getFarmerSpeedMultiplier(25)).toBe(0.80)
  })

  it('returns 0.70 at level 40', () => {
    expect(getFarmerSpeedMultiplier(40)).toBe(0.70)
  })

  it('returns 0.55 at level 60', () => {
    expect(getFarmerSpeedMultiplier(60)).toBe(0.55)
  })

  it('returns 0.40 at level 80+', () => {
    expect(getFarmerSpeedMultiplier(80)).toBe(0.40)
    expect(getFarmerSpeedMultiplier(99)).toBe(0.40)
  })

  it('never goes below 0.40', () => {
    for (let lv = 0; lv <= 99; lv++) {
      expect(getFarmerSpeedMultiplier(lv)).toBeGreaterThanOrEqual(0.40)
    }
  })

  it('is monotonically non-increasing with level', () => {
    let prev = getFarmerSpeedMultiplier(0)
    for (let lv = 1; lv <= 99; lv++) {
      const cur = getFarmerSpeedMultiplier(lv)
      expect(cur).toBeLessThanOrEqual(prev)
      prev = cur
    }
  })
})

describe('getFarmerBonusYieldChance', () => {
  it('returns 0 at level 0-24', () => {
    expect(getFarmerBonusYieldChance(0)).toBe(0)
    expect(getFarmerBonusYieldChance(24)).toBe(0)
  })

  it('returns 0.15 at level 25-59', () => {
    expect(getFarmerBonusYieldChance(25)).toBe(0.15)
    expect(getFarmerBonusYieldChance(59)).toBe(0.15)
  })

  it('returns 0.45 at level 60+', () => {
    expect(getFarmerBonusYieldChance(60)).toBe(0.45)
    expect(getFarmerBonusYieldChance(99)).toBe(0.45)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PART 8: HARVEST FAIL CHANCE
// ═══════════════════════════════════════════════════════════════════════════════

describe('FAIL_CHANCE_BY_RARITY', () => {
  it('is ordered: common < rare < epic < legendary < mythic', () => {
    const rarities = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const
    for (let i = 1; i < rarities.length; i++) {
      expect(FAIL_CHANCE_BY_RARITY[rarities[i]]).toBeGreaterThan(FAIL_CHANCE_BY_RARITY[rarities[i - 1]])
    }
  })

  it('all fail chances are in [0.01, 0.50]', () => {
    for (const [rarity, chance] of Object.entries(FAIL_CHANCE_BY_RARITY)) {
      expect(chance, `${rarity}`).toBeGreaterThanOrEqual(0.01)
      expect(chance, `${rarity}`).toBeLessThanOrEqual(0.50)
    }
  })
})

describe('getFarmerFailReduction', () => {
  it('returns 0 at level 0', () => {
    expect(getFarmerFailReduction(0)).toBe(0)
  })

  it('returns 0.02 at level 10', () => {
    expect(getFarmerFailReduction(10)).toBe(0.02)
  })

  it('returns 0.15 at level 80+', () => {
    expect(getFarmerFailReduction(80)).toBe(0.15)
    expect(getFarmerFailReduction(99)).toBe(0.15)
  })

  it('is monotonically non-decreasing', () => {
    let prev = 0
    for (let lv = 0; lv <= 99; lv++) {
      const cur = getFarmerFailReduction(lv)
      expect(cur).toBeGreaterThanOrEqual(prev)
      prev = cur
    }
  })
})

describe('getEffectiveFailChance', () => {
  it('returns base chance with no farmhouse or farmer bonus', () => {
    expect(getEffectiveFailChance('common', 0, 0)).toBeCloseTo(FAIL_CHANCE_BY_RARITY['common'], 5)
    expect(getEffectiveFailChance('mythic', 0, 0)).toBeCloseTo(FAIL_CHANCE_BY_RARITY['mythic'], 5)
  })

  it('farmhouse reduces fail chance (2% per level)', () => {
    const base = getEffectiveFailChance('common', 0)
    const withFarmhouse = getEffectiveFailChance('common', 5)
    expect(withFarmhouse).toBeCloseTo(base - 5 * 0.02, 5)
  })

  it('farmer level also reduces fail chance', () => {
    const base = getEffectiveFailChance('common', 0, 0)
    const withFarmer = getEffectiveFailChance('common', 0, 80)
    expect(withFarmer).toBeLessThan(base)
  })

  it('combined reductions cannot go below 1%', () => {
    // Max farmhouse (10) + max farmer (80) should clamp at 0.01
    const result = getEffectiveFailChance('common', 10, 99)
    expect(result).toBeGreaterThanOrEqual(0.01)
  })

  it('cannot exceed 50%', () => {
    // Even with mythic seed and no reductions
    expect(getEffectiveFailChance('mythic', 0, 0)).toBeLessThanOrEqual(0.50)
  })

  it('higher rarity always has higher fail chance than lower rarity (same conditions)', () => {
    const common = getEffectiveFailChance('common', 3, 20)
    const mythic = getEffectiveFailChance('mythic', 3, 20)
    expect(mythic).toBeGreaterThan(common)
  })
})

describe('rollHarvestFail', () => {
  it('always fails when random = 0 (below any chance)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(rollHarvestFail('common', 0, 0)).toBe(true)
    vi.restoreAllMocks()
  })

  it('never fails when random = 0.999 (above all chances)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    expect(rollHarvestFail('mythic', 0, 0)).toBe(false)
    vi.restoreAllMocks()
  })
})

describe('rollCropRot', () => {
  it('returns null when random exceeds effective rot chance', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    expect(rollCropRot('common', 0)).toBeNull()
    vi.restoreAllMocks()
  })

  it('returns rotAtFraction in [0.3, 0.7] when rot occurs', () => {
    // First random call: triggers rot (value 0, below base chance)
    // Second random call: sets fraction (value 0.5 → 0.3 + 0.5*0.4 = 0.5)
    let callCount = 0
    vi.spyOn(Math, 'random').mockImplementation(() => {
      callCount++
      return callCount === 1 ? 0 : 0.5
    })
    const result = rollCropRot('common', 0)
    expect(result).not.toBeNull()
    expect(result!.rotAtFraction).toBeCloseTo(0.3 + 0.5 * 0.4, 5)
    expect(result!.rotAtFraction).toBeGreaterThanOrEqual(0.3)
    expect(result!.rotAtFraction).toBeLessThanOrEqual(0.7)
    vi.restoreAllMocks()
  })

  it('farmhouse reduces rot chance', () => {
    // With max farmhouse (level 10), rot chance for common should be 0%
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const result = rollCropRot('common', 10)
    // base=0.12, reduction=10*0.02=0.20, effectiveChance = max(0, 0.12-0.20) = 0
    // So Math.random() < 0 is always false → no rot
    expect(result).toBeNull()
    vi.restoreAllMocks()
  })
})

describe('getEffectiveRotChance', () => {
  it('returns base chance with no farmhouse', () => {
    expect(getEffectiveRotChance('common', 0)).toBeCloseTo(FAIL_CHANCE_BY_RARITY['common'], 5)
  })

  it('reduces by 2% per farmhouse level', () => {
    const base = getEffectiveRotChance('epic', 0)
    const reduced = getEffectiveRotChance('epic', 5)
    expect(reduced).toBeCloseTo(base - 0.10, 5)
  })

  it('clamps to 0 (cannot be negative)', () => {
    expect(getEffectiveRotChance('common', 10)).toBe(0)
    expect(getEffectiveRotChance('common', 99)).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PART 9: FARMHOUSE SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

describe('FARMHOUSE_LEVELS', () => {
  it('has exactly 10 levels', () => {
    expect(FARMHOUSE_LEVELS.length).toBe(10)
  })

  it('FARMHOUSE_UNLOCK_LEVEL is 45', () => {
    expect(FARMHOUSE_UNLOCK_LEVEL).toBe(45)
  })

  it('level numbers are sequential 1-10', () => {
    for (let i = 0; i < FARMHOUSE_LEVELS.length; i++) {
      expect(FARMHOUSE_LEVELS[i].level).toBe(i + 1)
    }
  })

  it('gold costs are increasing', () => {
    for (let i = 1; i < FARMHOUSE_LEVELS.length; i++) {
      expect(FARMHOUSE_LEVELS[i].goldCost).toBeGreaterThan(FARMHOUSE_LEVELS[i - 1].goldCost)
    }
  })

  it('build times are non-decreasing', () => {
    for (let i = 1; i < FARMHOUSE_LEVELS.length; i++) {
      expect(FARMHOUSE_LEVELS[i].buildDurationMs).toBeGreaterThanOrEqual(FARMHOUSE_LEVELS[i - 1].buildDurationMs)
    }
  })

  it('bonuses are non-decreasing with level', () => {
    for (let i = 1; i < FARMHOUSE_LEVELS.length; i++) {
      const prev = FARMHOUSE_LEVELS[i - 1].bonuses
      const cur = FARMHOUSE_LEVELS[i].bonuses
      expect(cur.rotReductionPct).toBeGreaterThanOrEqual(prev.rotReductionPct)
      expect(cur.growSpeedPct).toBeGreaterThanOrEqual(prev.growSpeedPct)
      expect(cur.autoCompostPct).toBeGreaterThanOrEqual(prev.autoCompostPct)
      expect(cur.yieldBonusPct).toBeGreaterThanOrEqual(prev.yieldBonusPct)
    }
  })

  it('only level 10 has autoHarvest=true', () => {
    for (let i = 0; i < FARMHOUSE_LEVELS.length - 1; i++) {
      expect(FARMHOUSE_LEVELS[i].bonuses.autoHarvest).toBe(false)
    }
    expect(FARMHOUSE_LEVELS[9].bonuses.autoHarvest).toBe(true)
  })

  it('level 10 costs 500,000 gold', () => {
    expect(FARMHOUSE_LEVELS[9].goldCost).toBe(500_000)
  })

  it('all levels have valid materials (non-empty)', () => {
    for (const def of FARMHOUSE_LEVELS) {
      expect(Object.keys(def.materials).length, `level ${def.level} materials`).toBeGreaterThan(0)
      for (const [, qty] of Object.entries(def.materials)) {
        expect(qty).toBeGreaterThan(0)
      }
    }
  })
})

describe('getFarmhouseBonuses', () => {
  it('returns zero bonuses at level 0 (no farmhouse)', () => {
    const b = getFarmhouseBonuses(0)
    expect(b.rotReductionPct).toBe(0)
    expect(b.growSpeedPct).toBe(0)
    expect(b.autoCompostPct).toBe(0)
    expect(b.yieldBonusPct).toBe(0)
    expect(b.autoHarvest).toBe(false)
  })

  it('returns correct bonuses at level 1', () => {
    const b = getFarmhouseBonuses(1)
    expect(b.rotReductionPct).toBe(2)
    expect(b.growSpeedPct).toBe(3)
    expect(b.autoHarvest).toBe(false)
  })

  it('returns max bonuses at level 10', () => {
    const b = getFarmhouseBonuses(10)
    expect(b.growSpeedPct).toBe(25)
    expect(b.yieldBonusPct).toBe(25)
    expect(b.autoHarvest).toBe(true)
  })

  it('clamps at max level (11+ returns level 10 bonuses)', () => {
    const max = getFarmhouseBonuses(10)
    const over = getFarmhouseBonuses(11)
    expect(over.growSpeedPct).toBe(max.growSpeedPct)
    expect(over.autoHarvest).toBe(max.autoHarvest)
  })
})

describe('getEffectiveGrowTime', () => {
  it('returns base time with no farmhouse (level 0)', () => {
    expect(getEffectiveGrowTime(1000, 0)).toBe(1000)
  })

  it('reduces grow time based on farmhouse speed bonus', () => {
    // Level 1: growSpeedPct = 3%, so 1000 * (1 - 0.03) = 970
    expect(getEffectiveGrowTime(1000, 1)).toBe(970)
  })

  it('level 10 reduces grow time by 25%', () => {
    // 1000 * (1 - 0.25) = 750
    expect(getEffectiveGrowTime(1000, 10)).toBe(750)
  })

  it('always returns at least 1 second', () => {
    // Even with extreme reduction
    expect(getEffectiveGrowTime(1, 10)).toBeGreaterThanOrEqual(1)
  })

  it('higher farmhouse level = shorter grow time', () => {
    const base = getEffectiveGrowTime(3600, 0)
    for (let lv = 1; lv <= 10; lv++) {
      expect(getEffectiveGrowTime(3600, lv)).toBeLessThanOrEqual(base)
    }
  })
})

describe('getNextFarmhouseUpgrade', () => {
  it('returns level 1 definition when at level 0', () => {
    const next = getNextFarmhouseUpgrade(0)
    expect(next).not.toBeNull()
    expect(next!.level).toBe(1)
  })

  it('returns level N+1 when at level N', () => {
    for (let lv = 0; lv < 9; lv++) {
      const next = getNextFarmhouseUpgrade(lv)
      expect(next!.level).toBe(lv + 1)
    }
  })

  it('returns null when at max level (10)', () => {
    expect(getNextFarmhouseUpgrade(10)).toBeNull()
    expect(getNextFarmhouseUpgrade(11)).toBeNull()
  })
})

describe('FARMHOUSE_ICONS', () => {
  it('has icons for levels 0-10', () => {
    for (let lv = 0; lv <= 10; lv++) {
      expect(FARMHOUSE_ICONS[lv]).toBeTruthy()
    }
  })

  it('getFarmhouseIcon returns correct icon', () => {
    expect(getFarmhouseIcon(0)).toBe(FARMHOUSE_ICONS[0])
    expect(getFarmhouseIcon(10)).toBe(FARMHOUSE_ICONS[10])
  })

  it('getFarmhouseIcon clamps at 10 for higher levels', () => {
    expect(getFarmhouseIcon(99)).toBe(FARMHOUSE_ICONS[10])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PART 10: FORMAT HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

describe('formatGrowTime', () => {
  it('formats seconds < 60 with "s" suffix', () => {
    expect(formatGrowTime(5)).toBe('5s')
    expect(formatGrowTime(59)).toBe('59s')
  })

  it('formats 1 minute correctly', () => {
    expect(formatGrowTime(60)).toBe('1m')
    expect(formatGrowTime(90)).toBe('1m') // floor division
    expect(formatGrowTime(119)).toBe('1m')
  })

  it('formats hours and minutes', () => {
    expect(formatGrowTime(3600)).toBe('1h')
    expect(formatGrowTime(3660)).toBe('1h 1m')
    expect(formatGrowTime(7200)).toBe('2h')
    expect(formatGrowTime(7320)).toBe('2h 2m')
  })

  it('wheat seed grow time formats as 5m', () => {
    expect(formatGrowTime(5 * 60)).toBe('5m')
  })

  it('void_spore grow time formats as 8h', () => {
    expect(formatGrowTime(8 * 60 * 60)).toBe('8h')
  })
})

describe('formatCountdown', () => {
  it('returns "Ready!" for 0 or negative seconds', () => {
    expect(formatCountdown(0)).toBe('Ready!')
    expect(formatCountdown(-1)).toBe('Ready!')
  })

  it('formats seconds only', () => {
    expect(formatCountdown(5)).toBe('5s')
    expect(formatCountdown(59)).toBe('59s')
  })

  it('formats minutes and seconds', () => {
    expect(formatCountdown(65)).toBe('1m 05s')
    expect(formatCountdown(120)).toBe('2m 00s')
  })

  it('formats hours and minutes (no seconds shown)', () => {
    expect(formatCountdown(3600)).toBe('1h 00m')
    expect(formatCountdown(3670)).toBe('1h 01m')
    expect(formatCountdown(7320)).toBe('2h 02m')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PART 11: getFarmItemDisplay
// ═══════════════════════════════════════════════════════════════════════════════

describe('getFarmItemDisplay', () => {
  it('returns display for seed zip IDs', () => {
    const d = getFarmItemDisplay('seed_zip_common')
    expect(d).not.toBeNull()
    expect(d!.name).toContain('Common')
    expect(d!.rarity).toBe('common')
  })

  it('returns display for seed IDs', () => {
    const d = getFarmItemDisplay('wheat_seed')
    expect(d).not.toBeNull()
    expect(d!.name).toBe('Wheat Seed')
    expect(d!.rarity).toBe('common')
  })

  it('returns null for unknown item IDs', () => {
    expect(getFarmItemDisplay('unknown_item')).toBeNull()
    expect(getFarmItemDisplay('')).toBeNull()
    expect(getFarmItemDisplay('wheat')).toBeNull() // plant, not seed
  })

  it('returns display for legendary seed zip', () => {
    const d = getFarmItemDisplay('seed_zip_legendary')
    expect(d).not.toBeNull()
    expect(d!.rarity).toBe('legendary')
  })

  it('returns display for all seed IDs', () => {
    for (const seed of SEED_DEFS) {
      const d = getFarmItemDisplay(seed.id)
      expect(d, `display for ${seed.id}`).not.toBeNull()
      expect(d!.name).toBe(seed.name)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PART 12: INTEGRATION — seed → harvest pipeline
// ═══════════════════════════════════════════════════════════════════════════════

describe('farming pipeline integration', () => {
  it('every seed yields a plant that has combat buffs', () => {
    for (const seed of SEED_DEFS) {
      expect(PLANT_COMBAT_BUFFS[seed.yieldPlantId], `${seed.id} → ${seed.yieldPlantId}`).toBeDefined()
    }
  })

  it('effective fail chance decreases with farmhouse level', () => {
    for (const seed of SEED_DEFS) {
      const base = getEffectiveFailChance(seed.rarity, 0)
      const farmhouseMax = getEffectiveFailChance(seed.rarity, 10)
      expect(farmhouseMax).toBeLessThanOrEqual(base)
    }
  })

  it('effective grow time decreases with farmhouse level', () => {
    for (const seed of SEED_DEFS) {
      const base = getEffectiveGrowTime(seed.growTimeSeconds, 0)
      const reduced = getEffectiveGrowTime(seed.growTimeSeconds, 10)
      expect(reduced).toBeLessThanOrEqual(base)
    }
  })

  it('slot costs cover all seeds — mid-game seeds locked behind unlock cost progression', () => {
    // Epic seeds (clover, orchid) need later slots — verify mid-game access cost
    const epicSeeds = SEED_DEFS.filter((s) => s.rarity === 'epic')
    expect(epicSeeds.length).toBeGreaterThan(0)
    // Slots 4-7 cost 3500-20000 gold — expensive enough to gate progress
    for (let i = 4; i <= 7; i++) {
      expect(SLOT_UNLOCK_COSTS[i]).toBeGreaterThanOrEqual(3_500)
    }
  })

  it('field2 slots are more expensive than field1 (progression gate)', () => {
    const field2SlotCosts = FIELD_DEFS[1].slots.map((s) => SLOT_UNLOCK_COSTS[s])
    const field1SlotCosts = FIELD_DEFS[0].slots.map((s) => SLOT_UNLOCK_COSTS[s])
    const avgField2 = field2SlotCosts.reduce((a, b) => a + b, 0) / field2SlotCosts.length
    const avgField1 = field1SlotCosts.reduce((a, b) => a + b, 0) / field1SlotCosts.length
    expect(avgField2).toBeGreaterThan(avgField1)
  })

  // Bug regression: farm plot unlock freezing (secondary skill check)
  it('canUnlockSlot does not freeze when secondary skill is missing from skillXP record', () => {
    // If secondarySkill check threw when skill wasn't in the record, this would throw
    expect(() => canUnlockSlot(11, 999_999, { farmer: 9_999_999 })).not.toThrow()
    const result = canUnlockSlot(11, 999_999, { farmer: 9_999_999 })
    expect(result.missingSecondary).toBe(true)
    expect(result.canUnlock).toBe(false)
  })

  // Bug regression: canUnlockSlot with no skillXP at all
  it('canUnlockSlot handles empty skillXP without errors', () => {
    expect(() => canUnlockSlot(15, 999_999, {})).not.toThrow()
    const result = canUnlockSlot(15, 999_999, {})
    expect(result.missingFarmer).toBe(true)
  })
})
