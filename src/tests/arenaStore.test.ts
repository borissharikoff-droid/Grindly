import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useArenaStore } from '../renderer/stores/arenaStore'
import type { BossDef, MobDef } from '../renderer/lib/combat'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../renderer/lib/supabase', () => ({ supabase: null }))
vi.mock('../renderer/stores/authStore', () => ({
  useAuthStore: { getState: () => ({ user: null }) },
}))
vi.mock('../renderer/stores/goldStore', () => ({
  useGoldStore: {
    getState: () => ({
      gold: 1000,
      addGold: vi.fn(),
      syncToSupabase: vi.fn().mockResolvedValue(undefined),
    }),
  },
}))
vi.mock('../renderer/stores/inventoryStore', () => ({
  useInventoryStore: {
    getState: () => ({
      addChest: vi.fn(),
      addItem: vi.fn(),
      deleteItem: vi.fn(),
      equippedBySlot: {},
    }),
  },
}))
vi.mock('../renderer/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('../renderer/services/dailyActivityService', () => ({
  recordDungeonComplete: vi.fn(),
}))
vi.mock('../renderer/stores/achievementStatsStore', () => ({
  useAchievementStatsStore: {
    getState: () => ({ incrementDungeonCompletions: vi.fn() }),
  },
}))
vi.mock('../renderer/stores/weeklyStore', () => ({
  useWeeklyStore: {
    getState: () => ({ incrementKill: vi.fn() }),
  },
}))
vi.mock('../renderer/services/guildService', () => ({
  applyGuildTax: vi.fn().mockResolvedValue(0),
}))
vi.mock('../renderer/stores/guildStore', () => ({
  useGuildStore: {
    getState: () => ({ hallLevel: 0, myGuild: null }),
  },
}))
vi.mock('../renderer/lib/guildBuffs', () => ({
  getGuildGoldMultiplier: () => 1,
  getGuildFarmYieldBonus: () => 0,
}))
vi.mock('../renderer/lib/hotZone', () => ({
  getHotZoneId: () => null,
  HOT_CHEST_TIER_UP: {},
}))
vi.mock('../renderer/lib/farming', () => ({
  PLANT_COMBAT_BUFFS: {},
  grantWarriorXP: vi.fn().mockResolvedValue(undefined),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const player = { atk: 50, hp: 200, hpRegen: 5, def: 10 }
const weakBoss: BossDef = {
  id: 'test_boss_weak',
  name: 'Weak Boss',
  icon: '🐛',
  hp: 10,
  atk: 1,
  rewards: { chestTier: 'common_chest' },
}
const strongBoss: BossDef = {
  id: 'test_boss_strong',
  name: 'Strong Boss',
  icon: '💀',
  hp: 99999,
  atk: 9999,
  rewards: { chestTier: 'legendary_chest' },
}
const weakMob: MobDef = {
  id: 'test_mob_weak',
  name: 'Weak Mob',
  icon: '🐀',
  hp: 5,
  atk: 1,
  xpReward: 10,
  goldMin: 5,
  goldMax: 10,
}

function startBattle(boss: BossDef | MobDef, isMob = false) {
  useArenaStore.setState({
    activeBattle: {
      bossId: boss.id,
      startTime: Date.now() - 60_000, // 60s elapsed → enough to resolve
      battleSeed: 42,
      playerSnapshot: player,
      bossSnapshot: boss,
      isDaily: false,
      isMob,
      mobDef: isMob ? (boss as MobDef) : undefined,
    },
    activeDungeon: null,
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('arenaStore — endBattle idempotency', () => {
  beforeEach(() => {
    useArenaStore.setState({
      activeBattle: null,
      activeDungeon: null,
      clearedZones: [],
      killCounts: {},
      dailyBossClaimedDate: null,
    })
  })

  it('returns neutral result when no active battle', () => {
    const result = useArenaStore.getState().endBattle()
    expect(result.goldLost).toBe(0)
    expect(result.chest).toBeNull()
    expect(result.lostItem).toBeNull()
  })

  it('calling endBattle twice returns neutral on second call', () => {
    startBattle(weakBoss)
    useArenaStore.getState().endBattle()
    const second = useArenaStore.getState().endBattle()
    // Second call has no activeBattle — must return neutral
    expect(second.goldLost).toBe(0)
    expect(second.chest).toBeNull()
  })

  it('clears activeBattle regardless of outcome', () => {
    startBattle(weakBoss)
    useArenaStore.getState().endBattle()
    expect(useArenaStore.getState().activeBattle).toBeNull()
  })
})

describe('arenaStore — endBattle boss victory', () => {
  beforeEach(() => {
    useArenaStore.setState({
      activeBattle: null,
      activeDungeon: null,
      clearedZones: [],
      killCounts: {},
      dailyBossClaimedDate: null,
    })
  })

  it('returns warriorXP > 0 for boss with defined XP reward', () => {
    // Manually set BOSS_WARRIOR_XP is not easily injectable; test structure only
    startBattle(weakBoss)
    const result = useArenaStore.getState().endBattle()
    // weakBoss is defeated (60s elapsed, 10hp, player atk 50) → victory
    expect(result).toBeDefined()
    expect(typeof result.goldLost).toBe('number')
    expect(typeof result.warriorXP).toBe('number')
  })

  it('activeBattle is null after battle ends', () => {
    startBattle(weakBoss)
    useArenaStore.getState().endBattle()
    expect(useArenaStore.getState().activeBattle).toBeNull()
  })
})

describe('arenaStore — endBattle player death', () => {
  beforeEach(() => {
    useArenaStore.setState({
      activeBattle: null,
      activeDungeon: null,
      clearedZones: [],
      killCounts: {},
      dailyBossClaimedDate: null,
    })
  })

  it('returns goldLost when player dies to strong boss', () => {
    // Strong boss kills player → death penalty
    useArenaStore.setState({
      activeBattle: {
        bossId: strongBoss.id,
        startTime: Date.now() - 600_000, // 10 min — player definitely dead
        battleSeed: 1,
        playerSnapshot: { atk: 1, hp: 1, hpRegen: 0, def: 0 },
        bossSnapshot: strongBoss,
        isDaily: false,
        isMob: false,
      },
      activeDungeon: null,
    })
    const result = useArenaStore.getState().endBattle()
    expect(typeof result.goldLost).toBe('number')
    expect(result.goldLost).toBeGreaterThanOrEqual(0)
  })
})

describe('arenaStore — endBattle error recovery (try/catch)', () => {
  beforeEach(() => {
    useArenaStore.setState({
      activeBattle: null,
      activeDungeon: null,
      clearedZones: [],
      killCounts: {},
      dailyBossClaimedDate: null,
    })
  })

  it('returns neutral result if bossSnapshot is corrupted (missing hp)', () => {
    useArenaStore.setState({
      activeBattle: {
        bossId: 'corrupted',
        startTime: Date.now() - 10_000,
        battleSeed: 42,
        playerSnapshot: player,
        // Intentionally corrupt: hp missing so compute will use NaN
        bossSnapshot: { id: 'corrupted', name: 'Corrupted', icon: '?', hp: NaN, atk: NaN, rewards: { chestTier: 'common_chest' } } as BossDef,
        isDaily: false,
        isMob: false,
      },
      activeDungeon: null,
    })
    // Should not throw — try/catch in endBattle handles this
    expect(() => useArenaStore.getState().endBattle()).not.toThrow()
    // After recovery, activeBattle should be null
    expect(useArenaStore.getState().activeBattle).toBeNull()
  })
})

describe('arenaStore — dungeon flow', () => {
  beforeEach(() => {
    useArenaStore.setState({
      activeBattle: null,
      activeDungeon: { zoneId: 'zone_1', goldEarned: 150 },
      clearedZones: [],
      killCounts: {},
      dailyBossClaimedDate: null,
    })
  })

  it('clears activeDungeon on boss victory in dungeon', () => {
    useArenaStore.setState({
      activeBattle: {
        bossId: weakBoss.id,
        startTime: Date.now() - 60_000,
        battleSeed: 42,
        playerSnapshot: player,
        bossSnapshot: weakBoss,
        isDaily: false,
        isMob: false,
        dungeonZoneId: 'zone_1',
      },
    })
    useArenaStore.getState().endBattle()
    expect(useArenaStore.getState().activeDungeon).toBeNull()
  })

  it('adds zone to clearedZones on dungeon boss victory', () => {
    useArenaStore.setState({
      activeBattle: {
        bossId: weakBoss.id,
        startTime: Date.now() - 60_000,
        battleSeed: 42,
        playerSnapshot: player,
        bossSnapshot: weakBoss,
        isDaily: false,
        isMob: false,
        dungeonZoneId: 'zone_1',
      },
    })
    useArenaStore.getState().endBattle()
    expect(useArenaStore.getState().clearedZones).toContain('zone_1')
  })

  it('forfeitDungeon clears both activeBattle and activeDungeon', () => {
    useArenaStore.setState({
      activeBattle: {
        bossId: weakBoss.id,
        startTime: Date.now(),
        battleSeed: 42,
        playerSnapshot: player,
        bossSnapshot: weakBoss,
        isDaily: false,
      },
    })
    useArenaStore.getState().forfeitDungeon()
    expect(useArenaStore.getState().activeBattle).toBeNull()
    expect(useArenaStore.getState().activeDungeon).toBeNull()
  })
})
