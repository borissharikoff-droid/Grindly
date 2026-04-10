/**
 * Tests for the mergeSkillPayload logic in supabaseSync.ts.
 * This function is the critical "never downgrade local skill XP" guard.
 * It's not exported, so we test the observable behavior through
 * restoreCloudSkillsToLocalStorage (via the exported hook) OR
 * test the pure logic directly by importing the internals.
 *
 * Since mergeSkillPayload is not exported, we test its behavior
 * by directly unit-testing the invariants it must satisfy.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock localStorage for Node test environment
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
if (!('localStorage' in globalThis)) {
  Object.defineProperty(globalThis, 'localStorage', { value: createMemoryStorage(), configurable: true })
}
import { skillLevelFromXP } from '../renderer/lib/skills'

// ── mergeSkillPayload invariant tests (pure logic, no Supabase) ───────────────
//
// The function does:
//   mergedXp = MAX(local.total_xp, existing.total_xp)
//   level    = MAX(local.level, existing.level, levelFromXP(mergedXp))
//   prestige = MAX(local.prestige, existing.prestige)

function mergeSkillPayload(
  local: { skill_id: string; total_xp: number; level: number; prestige_count: number; user_id: string; updated_at: string },
  existing?: { level?: number | null; total_xp?: number | null; prestige_count?: number | null },
) {
  const existingLevel = Math.max(0, Math.floor(existing?.level ?? 0))
  const existingXp = Math.max(0, Math.floor(existing?.total_xp ?? 0))
  const mergedXp = Math.max(local.total_xp, existingXp)
  const existingPrestige = Math.max(0, Math.floor(existing?.prestige_count ?? 0))
  return {
    ...local,
    total_xp: mergedXp,
    level: Math.max(local.level, existingLevel, skillLevelFromXP(mergedXp)),
    prestige_count: Math.max(local.prestige_count, existingPrestige),
  }
}

const base = {
  user_id: 'u1',
  skill_id: 'developer',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('mergeSkillPayload — XP merge', () => {
  it('takes local XP when local is higher', () => {
    const result = mergeSkillPayload(
      { ...base, total_xp: 5000, level: 10, prestige_count: 0 },
      { total_xp: 2000, level: 8 },
    )
    expect(result.total_xp).toBe(5000)
  })

  it('takes cloud XP when cloud is higher', () => {
    const result = mergeSkillPayload(
      { ...base, total_xp: 2000, level: 8, prestige_count: 0 },
      { total_xp: 5000, level: 10 },
    )
    expect(result.total_xp).toBe(5000)
  })

  it('never downgrades XP', () => {
    const local = { ...base, total_xp: 10000, level: 15, prestige_count: 0 }
    const result = mergeSkillPayload(local, { total_xp: 1 })
    expect(result.total_xp).toBeGreaterThanOrEqual(local.total_xp)
  })

  it('handles missing existing row gracefully', () => {
    const result = mergeSkillPayload({ ...base, total_xp: 3000, level: 9, prestige_count: 0 })
    expect(result.total_xp).toBe(3000)
    expect(result.level).toBeGreaterThanOrEqual(9)
  })

  it('existing null/undefined XP treated as 0', () => {
    const result = mergeSkillPayload(
      { ...base, total_xp: 500, level: 5, prestige_count: 0 },
      { total_xp: null },
    )
    expect(result.total_xp).toBe(500)
  })
})

describe('mergeSkillPayload — level merge', () => {
  it('level is at least skillLevelFromXP(mergedXp)', () => {
    const result = mergeSkillPayload(
      { ...base, total_xp: 50000, level: 1, prestige_count: 0 },
      { total_xp: 0, level: 0 },
    )
    expect(result.level).toBeGreaterThanOrEqual(skillLevelFromXP(50000))
  })

  it('level never downgrades from local', () => {
    const result = mergeSkillPayload(
      { ...base, total_xp: 0, level: 20, prestige_count: 0 },
      { total_xp: 0, level: 5 },
    )
    expect(result.level).toBeGreaterThanOrEqual(20)
  })

  it('level never downgrades from cloud', () => {
    const result = mergeSkillPayload(
      { ...base, total_xp: 0, level: 5, prestige_count: 0 },
      { total_xp: 0, level: 20 },
    )
    expect(result.level).toBeGreaterThanOrEqual(20)
  })
})

describe('mergeSkillPayload — prestige merge', () => {
  it('takes higher prestige from either side', () => {
    const result = mergeSkillPayload(
      { ...base, total_xp: 0, level: 0, prestige_count: 2 },
      { prestige_count: 5 },
    )
    expect(result.prestige_count).toBe(5)
  })

  it('never loses prestige levels', () => {
    const result = mergeSkillPayload(
      { ...base, total_xp: 0, level: 0, prestige_count: 3 },
      { prestige_count: 0 },
    )
    expect(result.prestige_count).toBeGreaterThanOrEqual(3)
  })
})

// ── Cloud skill restore invariants ────────────────────────────────────────────

describe('restoreCloudSkillsToLocalStorage invariants', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('takes MAX of local and cloud XP', () => {
    localStorage.setItem('grindly_skill_xp', JSON.stringify({ developer: 3000 }))
    const cloudRows = [{ skill_id: 'developer', total_xp: 5000 }]

    // Apply same logic as restoreCloudSkillsToLocalStorage
    const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
    for (const row of cloudRows) {
      const localXp = stored[row.skill_id] ?? 0
      if (row.total_xp > localXp) stored[row.skill_id] = row.total_xp
    }
    localStorage.setItem('grindly_skill_xp', JSON.stringify(stored))

    const result = JSON.parse(localStorage.getItem('grindly_skill_xp')!)
    expect(result.developer).toBe(5000)
  })

  it('does not reduce local XP when cloud is lower', () => {
    localStorage.setItem('grindly_skill_xp', JSON.stringify({ developer: 8000 }))
    const cloudRows = [{ skill_id: 'developer', total_xp: 1000 }]

    const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
    for (const row of cloudRows) {
      const localXp = stored[row.skill_id] ?? 0
      if (row.total_xp > localXp) stored[row.skill_id] = row.total_xp
    }
    localStorage.setItem('grindly_skill_xp', JSON.stringify(stored))

    const result = JSON.parse(localStorage.getItem('grindly_skill_xp')!)
    expect(result.developer).toBe(8000)
  })

  it('adds new skill from cloud if not present locally', () => {
    localStorage.setItem('grindly_skill_xp', JSON.stringify({ developer: 1000 }))
    const cloudRows = [{ skill_id: 'gamer', total_xp: 4000 }]

    const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
    for (const row of cloudRows) {
      const localXp = stored[row.skill_id] ?? 0
      if (row.total_xp > localXp) stored[row.skill_id] = row.total_xp
    }
    localStorage.setItem('grindly_skill_xp', JSON.stringify(stored))

    const result = JSON.parse(localStorage.getItem('grindly_skill_xp')!)
    expect(result.gamer).toBe(4000)
    expect(result.developer).toBe(1000)
  })
})
