import { afterEach, beforeAll, describe, it, expect } from 'vitest'
import {
  skillLevelFromXP,
  skillXPProgress,
  skillHoursFromXP,
  computeSessionSkillXP,
  categoryToSkillId,
  getSkillById,
  getStoredSkillXP,
  SKILLS,
} from '../renderer/lib/skills'

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() { return store.size },
    clear() { store.clear() },
    getItem(key: string) { return store.has(key) ? store.get(key)! : null },
    key(index: number) { return Array.from(store.keys())[index] ?? null },
    removeItem(key: string) { store.delete(key) },
    setItem(key: string, value: string) { store.set(key, String(value)) },
  }
}

describe('skillLevelFromXP', () => {
  it('returns 0 for 0 XP (unleveled)', () => {
    expect(skillLevelFromXP(0)).toBe(0)
  })

  it('reaches level 1 with ~2 min (120 XP) - flattened early curve', () => {
    expect(skillLevelFromXP(119)).toBe(0)
    expect(skillLevelFromXP(120)).toBe(1)
  })

  it('reaches level 2 with ~6 min (360 XP) - flattened early curve', () => {
    expect(skillLevelFromXP(359)).toBe(1)
    expect(skillLevelFromXP(360)).toBe(2)
  })

  it('reaches level 5 with ~30 min (1800 XP) - flattened early curve', () => {
    expect(skillLevelFromXP(1799)).toBe(4)
    expect(skillLevelFromXP(1800)).toBe(5)
  })

  it('returns 0 for negative XP', () => {
    expect(skillLevelFromXP(-100)).toBe(0)
  })

  it('returns 99 for max XP (3600000)', () => {
    expect(skillLevelFromXP(3600000)).toBe(99)
  })

  it('returns 99 for beyond max XP', () => {
    expect(skillLevelFromXP(10000000)).toBe(99)
  })

  it('increases monotonically with XP', () => {
    let prevLevel = -1
    for (let xp = 0; xp <= 3600000; xp += 36000) {
      const level = skillLevelFromXP(xp)
      expect(level).toBeGreaterThanOrEqual(prevLevel)
      prevLevel = level
    }
  })
})

describe('skillXPProgress', () => {
  it('returns {current: 0, needed: >0} for 0 XP', () => {
    const { current, needed } = skillXPProgress(0)
    expect(current).toBe(0)
    expect(needed).toBeGreaterThan(0)
  })

  it('current is <= needed for non-max levels', () => {
    for (const xp of [0, 100, 1000, 50000, 1000000]) {
      const { current, needed } = skillXPProgress(xp)
      if (needed > 0) expect(current).toBeLessThanOrEqual(needed)
    }
  })
})

describe('skillHoursFromXP', () => {
  it('returns 0 for 0 XP', () => {
    expect(skillHoursFromXP(0)).toBe(0)
  })

  it('returns ~1 for 3600 XP (1 hour of seconds)', () => {
    expect(skillHoursFromXP(3600)).toBeCloseTo(1, 0)
  })

  it('returns ~1000 for 3600000 XP', () => {
    expect(skillHoursFromXP(3600000)).toBeCloseTo(1000, 0)
  })
})

describe('categoryToSkillId', () => {
  it('maps coding to developer', () => {
    expect(categoryToSkillId('coding')).toBe('developer')
  })

  it('maps design to designer', () => {
    expect(categoryToSkillId('design')).toBe('designer')
  })

  it('maps games to gamer', () => {
    expect(categoryToSkillId('games')).toBe('gamer')
  })

  it('maps unknown to researcher (fallback)', () => {
    expect(categoryToSkillId('unknown_category')).toBe('researcher')
  })

  it('maps other to researcher', () => {
    expect(categoryToSkillId('other')).toBe('researcher')
  })
})

describe('getSkillById', () => {
  it('returns developer for id developer', () => {
    const skill = getSkillById('developer')
    expect(skill).toBeDefined()
    expect(skill!.name).toBe('Developer')
    expect(skill!.category).toBe('coding')
  })

  it('returns undefined for invalid id', () => {
    expect(getSkillById('nonexistent')).toBeUndefined()
  })

  it('all SKILLS have unique ids', () => {
    const ids = SKILLS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('computeSessionSkillXP', () => {
  it('returns XP by skill for single coding segment', () => {
    const now = Date.now()
    const result = computeSessionSkillXP([
      { category: 'coding', startTime: now, endTime: now + 60000 }, // 60 seconds
    ])
    expect(result.developer).toBe(60)
  })

  it('returns XP for multiple categories', () => {
    const now = Date.now()
    const result = computeSessionSkillXP([
      { category: 'coding', startTime: now, endTime: now + 30000 },
      { category: 'design', startTime: now + 30000, endTime: now + 60000 },
    ])
    expect(result.developer).toBe(30)
    expect(result.designer).toBe(30)
  })

  it('returns empty object for empty activities', () => {
    const result = computeSessionSkillXP([])
    expect(Object.keys(result)).toHaveLength(0)
  })

  it('ignores segments with 0 or negative duration', () => {
    const now = Date.now()
    const result = computeSessionSkillXP([
      { category: 'coding', startTime: now, endTime: now }, // 0 duration
    ])
    expect(result.developer ?? 0).toBe(0)
  })
})

describe('getStoredSkillXP — safe localStorage reader', () => {
  beforeAll(() => {
    if (!('localStorage' in globalThis)) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: createMemoryStorage(),
        configurable: true,
      })
    }
  })
  afterEach(() => {
    localStorage.removeItem('grindly_skill_xp')
  })

  it('returns empty map when key is missing', () => {
    localStorage.removeItem('grindly_skill_xp')
    expect(getStoredSkillXP()).toEqual({})
  })

  it('returns parsed map for valid JSON', () => {
    localStorage.setItem('grindly_skill_xp', JSON.stringify({ developer: 500, gamer: 200 }))
    expect(getStoredSkillXP()).toEqual({ developer: 500, gamer: 200 })
  })

  it('returns empty map when JSON is malformed (no throw)', () => {
    localStorage.setItem('grindly_skill_xp', '{not json')
    expect(getStoredSkillXP()).toEqual({})
  })

  it('strips non-numeric values and coerces floats to floor ints', () => {
    localStorage.setItem('grindly_skill_xp', JSON.stringify({
      developer: 500.7,
      gamer: 'bad',
      researcher: NaN,
      creator: Infinity,
      learner: -3,
    }))
    const result = getStoredSkillXP()
    expect(result.developer).toBe(500) // floor
    expect(result.learner).toBe(0)     // max(0, floor(-3))
    expect('gamer' in result).toBe(false)
    expect('researcher' in result).toBe(false)
    expect('creator' in result).toBe(false)
  })

  it('returns empty when value is an array or non-object', () => {
    localStorage.setItem('grindly_skill_xp', JSON.stringify([1, 2, 3]))
    expect(getStoredSkillXP()).toEqual({})
    localStorage.setItem('grindly_skill_xp', JSON.stringify('not-an-object'))
    expect(getStoredSkillXP()).toEqual({})
  })
})
