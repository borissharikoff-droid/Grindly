// Edge-case tests for raidService and weeklyStore — v3.9.0
import { describe, it, expect } from 'vitest'
import {
  getRaidPhase,
  rarityMeetsMin,
  checkRaidGates,
  RAID_TIER_CONFIGS,
  PARTY_HP_MAX,
  PARTY_DAILY_DAMAGE,
  grantRaidVictoryLoot,
  RAID_EXCLUSIVE_ITEM_IDS,
} from '../renderer/services/raidService'

describe('getRaidPhase', () => {
  it('returns phase 1 when HP > 66%', () => {
    expect(getRaidPhase(700, 1000)).toBe(1)
    expect(getRaidPhase(661, 1000)).toBe(1)
  })
  it('returns phase 2 when HP 33-66%', () => {
    expect(getRaidPhase(660, 1000)).toBe(2)
    expect(getRaidPhase(331, 1000)).toBe(2)
  })
  it('returns phase 3 when HP <= 33%', () => {
    expect(getRaidPhase(330, 1000)).toBe(3)
    expect(getRaidPhase(0, 1000)).toBe(3)
    expect(getRaidPhase(1, 1000)).toBe(3)
  })
  it('handles exact 66% boundary — 660/1000 is phase 2', () => {
    expect(getRaidPhase(660, 1000)).toBe(2)
    expect(getRaidPhase(661, 1000)).toBe(1)
  })
  it('returns phase 3 when hpMax is 0 (NaN guard)', () => {
    // hpRemaining/0 = NaN; NaN comparisons all false => falls through to return 3
    expect(getRaidPhase(0, 0)).toBe(3)
  })
})

describe('rarityMeetsMin', () => {
  it('common does not meet epic minimum', () => {
    expect(rarityMeetsMin('common', 'epic')).toBe(false)
  })
  it('legendary meets epic minimum', () => {
    expect(rarityMeetsMin('legendary', 'epic')).toBe(true)
  })
  it('mythic meets mythic minimum', () => {
    expect(rarityMeetsMin('mythic', 'mythic')).toBe(true)
  })
  it('epic does not meet legendary minimum', () => {
    expect(rarityMeetsMin('epic', 'legendary')).toBe(false)
  })
  it('same rarity meets itself', () => {
    const rarities = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const
    for (const r of rarities) {
      expect(rarityMeetsMin(r, r)).toBe(true)
    }
  })
})

describe('checkRaidGates — ancient tier', () => {
  const fullSkillXp: Record<string, number> = {
    developer: 3_600_000, designer: 3_600_000,
    gamer: 3_600_000, communicator: 3_600_000,
    researcher: 3_600_000,
  }

  it('fails when fewer than 6 zones cleared', () => {
    const result = checkRaidGates('ancient', ['z1', 'z2', 'z3', 'z4', 'z5'], 25, fullSkillXp, 2)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/zones/)
  })
  it('fails when warrior level below 20', () => {
    const result = checkRaidGates('ancient', ['z1','z2','z3','z4','z5','z6'], 15, fullSkillXp, 2)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/Warrior/)
  })
  it('fails when fewer than 4 skills at required level', () => {
    const lowXp = { developer: 100 }
    const result = checkRaidGates('ancient', ['z1','z2','z3','z4','z5','z6'], 25, lowXp, 2)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/skills/)
  })
  it('fails when solo (party_min = 2)', () => {
    const result = checkRaidGates('ancient', ['z1','z2','z3','z4','z5','z6'], 25, fullSkillXp, 1)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/party/)
  })
  it('passes all gates', () => {
    const result = checkRaidGates('ancient', ['z1','z2','z3','z4','z5','z6'], 25, fullSkillXp, 2)
    expect(result.ok).toBe(true)
    expect(result.reason).toBeUndefined()
  })
})

describe('checkRaidGates — eternal tier', () => {
  const fullSkillXp: Record<string, number> = {
    developer: 3_600_000, designer: 3_600_000,
    gamer: 3_600_000, communicator: 3_600_000,
    researcher: 3_600_000,
  }
  const zones8 = ['z1','z2','z3','z4','z5','z6','z7','z8']

  it('requires warrior level 80', () => {
    const low = checkRaidGates('eternal', zones8, 79, fullSkillXp, 3)
    expect(low.ok).toBe(false)
    const pass = checkRaidGates('eternal', zones8, 80, fullSkillXp, 3)
    expect(pass.ok).toBe(true)
  })
  it('requires exactly 3 party members', () => {
    const two = checkRaidGates('eternal', zones8, 80, fullSkillXp, 2)
    expect(two.ok).toBe(false)
    expect(two.reason).toMatch(/3/)
  })
  it('requires all 8 zones cleared', () => {
    const sevenZones = zones8.slice(0, 7)
    const result = checkRaidGates('eternal', sevenZones, 80, fullSkillXp, 3)
    expect(result.ok).toBe(false)
  })
})

describe('PARTY_HP_MAX / PARTY_DAILY_DAMAGE sanity', () => {
  it('all tiers define party_hp_max > 0', () => {
    expect(PARTY_HP_MAX.ancient).toBeGreaterThan(0)
    expect(PARTY_HP_MAX.mythic).toBeGreaterThan(0)
    expect(PARTY_HP_MAX.eternal).toBeGreaterThan(0)
  })
  it('phase 3 damage exceeds phase 1 for every tier', () => {
    const tiers = ['ancient', 'mythic', 'eternal'] as const
    for (const tier of tiers) {
      expect(PARTY_DAILY_DAMAGE[tier][3]).toBeGreaterThan(PARTY_DAILY_DAMAGE[tier][1])
    }
  })
  it('ancient party survives at least 2 full days at phase 1 with no healing', () => {
    const hp = PARTY_HP_MAX.ancient
    const dmg = PARTY_DAILY_DAMAGE.ancient[1]
    expect(hp / dmg).toBeGreaterThanOrEqual(2)
  })
  it('eternal party does not die on first day even at phase 3', () => {
    const hp = PARTY_HP_MAX.eternal
    const dmg = PARTY_DAILY_DAMAGE.eternal[3]
    expect(hp).toBeGreaterThan(dmg)
  })
  it('defend halved damage does not exceed full HP in one day for any tier/phase', () => {
    const tiers = ['ancient', 'mythic', 'eternal'] as const
    const phases = [1, 2, 3] as const
    for (const tier of tiers) {
      for (const phase of phases) {
        const halved = Math.floor(PARTY_DAILY_DAMAGE[tier][phase] * 0.5)
        expect(PARTY_HP_MAX[tier]).toBeGreaterThan(halved)
      }
    }
  })
})

describe('grantRaidVictoryLoot', () => {
  it('always returns correct item per tier when Math.random = 0', async () => {
    const original = Math.random
    Math.random = () => 0
    try {
      expect(await grantRaidVictoryLoot('ancient')).toBe('raid_ancient_ring')
      expect(await grantRaidVictoryLoot('mythic')).toBe('raid_void_blade')
      expect(await grantRaidVictoryLoot('eternal')).toBe('raid_eternal_crown')
    } finally {
      Math.random = original
    }
  })
  it('returns null when Math.random = 1 (above all thresholds)', async () => {
    const original = Math.random
    Math.random = () => 0.9999
    try {
      expect(await grantRaidVictoryLoot('ancient')).toBeNull()
      expect(await grantRaidVictoryLoot('mythic')).toBeNull()
      expect(await grantRaidVictoryLoot('eternal')).toBeNull()
    } finally {
      Math.random = original
    }
  })
  it('RAID_EXCLUSIVE_ITEM_IDS contains all tier drop items', () => {
    expect(RAID_EXCLUSIVE_ITEM_IDS).toContain('raid_ancient_ring')
    expect(RAID_EXCLUSIVE_ITEM_IDS).toContain('raid_void_blade')
    expect(RAID_EXCLUSIVE_ITEM_IDS).toContain('raid_eternal_crown')
    expect(RAID_EXCLUSIVE_ITEM_IDS).toHaveLength(3)
  })
})

describe('RAID_TIER_CONFIGS data integrity', () => {
  it('all tiers have boss_hp > 0', () => {
    for (const [, cfg] of Object.entries(RAID_TIER_CONFIGS)) {
      expect(cfg.boss_hp).toBeGreaterThan(0)
    }
  })
  it('contribution_per_win < boss_hp (single player cannot one-shot boss)', () => {
    for (const [, cfg] of Object.entries(RAID_TIER_CONFIGS)) {
      expect(cfg.contribution_per_win).toBeLessThan(cfg.boss_hp)
    }
  })
  it('higher tier requires more gates than lower tier', () => {
    const { ancient, mythic, eternal } = RAID_TIER_CONFIGS
    expect(mythic.warrior_level_req).toBeGreaterThan(ancient.warrior_level_req)
    expect(eternal.warrior_level_req).toBeGreaterThan(mythic.warrior_level_req)
    expect(mythic.zones_required).toBeGreaterThanOrEqual(ancient.zones_required)
    expect(eternal.zones_required).toBeGreaterThanOrEqual(mythic.zones_required)
  })
  it('ancient requires epic tribute, eternal requires mythic tribute', () => {
    expect(RAID_TIER_CONFIGS.ancient.tribute_min_rarity).toBe('epic')
    expect(RAID_TIER_CONFIGS.eternal.tribute_min_rarity).toBe('mythic')
  })
  it('encounter boss HP is greater than 0 for all tiers', () => {
    for (const [, cfg] of Object.entries(RAID_TIER_CONFIGS)) {
      expect(cfg.encounter.hp).toBeGreaterThan(0)
      expect(cfg.encounter.atk).toBeGreaterThan(0)
    }
  })
})

describe('weeklyStore isoWeekKey', () => {
  it('same calendar week returns same key', async () => {
    const { isoWeekKey } = await import('../renderer/stores/weeklyStore')
    const mon = isoWeekKey(new Date('2026-03-16T00:00:00Z'))
    const sun = isoWeekKey(new Date('2026-03-22T23:59:59Z'))
    expect(mon).toBe(sun)
  })
  it('consecutive weeks return different keys', async () => {
    const { isoWeekKey } = await import('../renderer/stores/weeklyStore')
    const week1 = isoWeekKey(new Date('2026-03-16T00:00:00Z'))
    const week2 = isoWeekKey(new Date('2026-03-23T00:00:00Z'))
    expect(week1).not.toBe(week2)
  })
  it('key format matches YYYY-WNN', async () => {
    const { isoWeekKey } = await import('../renderer/stores/weeklyStore')
    const key = isoWeekKey(new Date('2026-03-16T00:00:00Z'))
    expect(key).toMatch(/^\d{4}-W\d{2}$/)
  })
  it('new year boundary: Jan 1 2026 (Thursday) is in 2026-W01', async () => {
    const { isoWeekKey } = await import('../renderer/stores/weeklyStore')
    const key = isoWeekKey(new Date('2026-01-01T00:00:00Z'))
    expect(key).toBe('2026-W01')
  })
})
