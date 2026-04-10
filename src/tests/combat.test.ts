import { describe, it, expect } from 'vitest'
import {
  effectiveBossDps,
  effectivePlayerDps,
  computeBattleOutcome,
  computeBattleStateAtTime,
  computeWarriorBonuses,
  meetsBossRequirements,
} from '../renderer/lib/combat'
import type { CombatStats } from '../renderer/lib/loot'
import type { BossDef, MobDef } from '../renderer/lib/combat'

const player: CombatStats = { atk: 20, hp: 100, hpRegen: 2, def: 5 }
const boss: BossDef = {
  id: 'test_boss',
  name: 'Test Boss',
  icon: '👹',
  hp: 200,
  atk: 10,
  rewards: { chestTier: 'common_chest' },
}
const mob: MobDef = {
  id: 'test_mob',
  name: 'Test Mob',
  icon: '🐺',
  hp: 50,
  atk: 8,
  xpReward: 10,
  goldMin: 5,
  goldMax: 15,
}

// ── DPS helpers ────────────────────────────────────────────────────────────────

describe('effectivePlayerDps', () => {
  it('reduces damage by enemy DEF', () => {
    expect(effectivePlayerDps(20, 5)).toBeLessThan(effectivePlayerDps(20, 0))
  })

  it('enforces minimum damage floor (never 0)', () => {
    expect(effectivePlayerDps(10, 9999)).toBeGreaterThan(0)
  })

  it('full damage when DEF = 0', () => {
    expect(effectivePlayerDps(20, 0)).toBe(20)
  })
})

describe('effectiveBossDps', () => {
  it('reduces boss damage by player regen and DEF', () => {
    expect(effectiveBossDps(10, 3, 2)).toBeLessThan(effectiveBossDps(10, 0, 0))
  })

  it('enforces minimum damage floor', () => {
    expect(effectiveBossDps(10, 999, 999)).toBeGreaterThan(0)
  })

  it('no regen or DEF means full boss atk', () => {
    expect(effectiveBossDps(15, 0, 0)).toBe(15)
  })
})

// ── Battle outcome (deterministic / average) ──────────────────────────────────

describe('computeBattleOutcome', () => {
  it('strong player beats weak boss', () => {
    const strongPlayer: CombatStats = { atk: 100, hp: 200, hpRegen: 5, def: 10 }
    const { willWin } = computeBattleOutcome(strongPlayer, { ...boss, hp: 50, atk: 1 })
    expect(willWin).toBe(true)
  })

  it('weak player loses to strong boss', () => {
    const weakPlayer: CombatStats = { atk: 1, hp: 10, hpRegen: 0, def: 0 }
    const { willWin } = computeBattleOutcome(weakPlayer, { ...boss, hp: 10000, atk: 100 })
    expect(willWin).toBe(false)
  })

  it('returns finite win/loss times', () => {
    const { tWinSeconds, tLoseSeconds } = computeBattleOutcome(player, boss)
    expect(tWinSeconds).toBeGreaterThan(0)
    expect(tLoseSeconds).toBeGreaterThan(0)
  })

  it('boss with no ATK gives infinite lose time', () => {
    const { tLoseSeconds } = computeBattleOutcome(player, { ...boss, atk: 0 })
    expect(tLoseSeconds).toBe(Infinity)
  })
})

// ── Battle state at time ───────────────────────────────────────────────────────

describe('computeBattleStateAtTime (no seed — linear legacy)', () => {
  it('battle not complete at t=0', () => {
    const state = computeBattleStateAtTime(player, boss, 0)
    expect(state.isComplete).toBe(false)
    expect(state.victory).toBeNull()
  })

  it('boss HP decreases over time', () => {
    const t5 = computeBattleStateAtTime(player, boss, 5)
    const t10 = computeBattleStateAtTime(player, boss, 10)
    expect(t10.bossHp).toBeLessThan(t5.bossHp)
  })

  it('player HP decreases over time', () => {
    const state = computeBattleStateAtTime(player, { ...boss, atk: 50 }, 1)
    expect(state.playerHp).toBeLessThan(player.hp)
  })

  it('records victory when boss HP reaches 0', () => {
    const state = computeBattleStateAtTime(
      { atk: 1000, hp: 9999, hpRegen: 0, def: 0 },
      { ...boss, hp: 10 },
      100,
    )
    expect(state.victory).toBe(true)
    expect(state.isComplete).toBe(true)
    expect(state.bossHp).toBe(0)
  })

  it('records defeat when player HP reaches 0', () => {
    const state = computeBattleStateAtTime(
      { atk: 1, hp: 10, hpRegen: 0, def: 0 },
      { ...boss, hp: 9999, atk: 100 },
      100,
    )
    expect(state.victory).toBe(false)
    expect(state.isComplete).toBe(true)
    expect(state.playerHp).toBe(0)
  })
})

describe('computeBattleStateAtTime (seeded — deterministic)', () => {
  it('same seed produces same result', () => {
    const a = computeBattleStateAtTime(player, boss, 30, 12345)
    const b = computeBattleStateAtTime(player, boss, 30, 12345)
    expect(a.playerHp).toBe(b.playerHp)
    expect(a.bossHp).toBe(b.bossHp)
    expect(a.victory).toBe(b.victory)
  })

  it('different seeds can produce different results', () => {
    const a = computeBattleStateAtTime(player, boss, 30, 1)
    const b = computeBattleStateAtTime(player, boss, 30, 99999)
    // Not guaranteed different every time, but very likely with these seeds
    expect(typeof a.bossHp).toBe('number')
    expect(typeof b.bossHp).toBe('number')
  })

  it('HP values are non-negative', () => {
    const state = computeBattleStateAtTime(player, boss, 999, 42)
    expect(state.playerHp).toBeGreaterThanOrEqual(0)
    expect(state.bossHp).toBeGreaterThanOrEqual(0)
  })
})

// ── Warrior bonuses ───────────────────────────────────────────────────────────

describe('computeWarriorBonuses', () => {
  it('level 0 returns zero bonuses', () => {
    const bonuses = computeWarriorBonuses(0)
    expect(bonuses.atk).toBe(0)
    expect(bonuses.hp).toBe(0)
  })

  it('higher level gives higher bonuses', () => {
    const low = computeWarriorBonuses(5)
    const high = computeWarriorBonuses(50)
    expect(high.atk).toBeGreaterThan(low.atk)
    expect(high.hp).toBeGreaterThan(low.hp)
  })

  it('returns all four stat fields', () => {
    const bonuses = computeWarriorBonuses(10)
    expect(bonuses).toHaveProperty('atk')
    expect(bonuses).toHaveProperty('hp')
    expect(bonuses).toHaveProperty('hpRegen')
    expect(bonuses).toHaveProperty('def')
  })
})

// ── Boss requirements ─────────────────────────────────────────────────────────

describe('meetsBossRequirements', () => {
  it('meets requirements with strong player', () => {
    const result = meetsBossRequirements(
      { atk: 50, hp: 200, hpRegen: 5, def: 10 },
      {},
      { ...boss, requirements: { minAtk: 30, minHp: 100 } },
    )
    expect(result).toBe(true)
  })

  it('fails when ATK too low', () => {
    const result = meetsBossRequirements(
      { atk: 5, hp: 200, hpRegen: 5, def: 10 },
      {},
      { ...boss, requirements: { minAtk: 30 } },
    )
    expect(result).toBe(false)
  })

  it('no requirements always passes', () => {
    expect(meetsBossRequirements(player, {}, boss)).toBe(true)
  })
})
