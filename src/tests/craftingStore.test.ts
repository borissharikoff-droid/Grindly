import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks (hoisted before store import) ───────────────────────────────────────

vi.mock('../renderer/lib/crafting', () => ({
  CRAFT_RECIPE_MAP: {
    test_recipe: {
      id: 'test_recipe',
      outputItemId: 'test_item',
      outputQty: 1,
      secPerItem: 1,
      xpPerItem: 10,
      ingredients: [{ id: 'mat_a', qty: 1 }],
    },
  },
  canAffordRecipe: () => true,
  getCrafterSpeedMultiplier: () => 1,
  getCrafterDoubleChance: () => 0,
}))
vi.mock('../renderer/lib/skills', () => ({
  skillLevelFromXP: () => 1,
  getGrindlyLevel: () => 1,
  computeGrindlyBonuses: () => ({ craftSpeedMultiplier: 1 }),
}))
vi.mock('../renderer/lib/guildBuffs', () => ({
  getGuildCraftSpeedMultiplier: () => 1,
}))
vi.mock('../renderer/stores/guildStore', () => ({
  useGuildStore: { getState: () => ({ hallLevel: 0, incrementRaidProgress: vi.fn() }) },
}))
vi.mock('../renderer/services/dailyActivityService', () => ({
  recordCraftComplete: vi.fn(),
}))
vi.mock('../renderer/stores/achievementStatsStore', () => ({
  useAchievementStatsStore: { getState: () => ({ incrementCrafts: vi.fn() }) },
}))
vi.mock('../renderer/stores/goldStore', () => ({
  useGoldStore: { getState: () => ({ gold: 999_999, addGold: vi.fn() }) },
}))
vi.mock('../renderer/stores/bountyStore', () => ({
  useBountyStore: { getState: () => ({ incrementCraft: vi.fn() }) },
}))
vi.mock('../renderer/stores/weeklyStore', () => ({
  useWeeklyStore: { getState: () => ({ incrementCraft: vi.fn() }) },
}))
vi.mock('../renderer/lib/analytics', () => ({ track: vi.fn() }))

import { useCraftingStore, type CraftJob } from '../renderer/stores/craftingStore'

function buildJob(overrides: Partial<CraftJob> = {}): CraftJob {
  return {
    id: 'job_1',
    recipeId: 'test_recipe',
    outputItemId: 'test_item',
    outputQty: 1,
    totalQty: 5,
    doneQty: 0,
    secPerItem: 1,
    xpPerItem: 10,
    startedAt: 1_000_000,
    ingredients: [{ id: 'mat_a', qty: 1 }],
    ...overrides,
  }
}

describe('craftingStore.tick — commit-then-grant ordering', () => {
  beforeEach(() => {
    if (!('localStorage' in globalThis)) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 },
        configurable: true,
      })
    }
    useCraftingStore.setState({
      craftXp: 0,
      activeJob: null,
      queue: [],
      recipeMastery: {},
    })
  })

  it('does not call onGrant when no active job', () => {
    const onGrant = vi.fn()
    useCraftingStore.getState().tick(Date.now(), onGrant)
    expect(onGrant).not.toHaveBeenCalled()
  })

  it('grants correct qty + xp when tick advances a running job', () => {
    const job = buildJob({ startedAt: 1_000_000 })
    useCraftingStore.setState({ activeJob: job })
    const onGrant = vi.fn()
    // 3 seconds elapsed → 3 items complete
    useCraftingStore.getState().tick(1_003_000, onGrant)
    expect(onGrant).toHaveBeenCalledTimes(1)
    expect(onGrant).toHaveBeenCalledWith('test_item', 3, 30)
    expect(useCraftingStore.getState().activeJob?.doneQty).toBe(3)
    expect(useCraftingStore.getState().craftXp).toBe(30)
  })

  it('no-op when elapsed is less than secPerItem (no early grant)', () => {
    const job = buildJob({ startedAt: 1_000_000, secPerItem: 10 })
    useCraftingStore.setState({ activeJob: job })
    const onGrant = vi.fn()
    // Only 3s elapsed, secPerItem=10 → 0 completed → no grant.
    useCraftingStore.getState().tick(1_003_000, onGrant)
    expect(onGrant).not.toHaveBeenCalled()
    expect(useCraftingStore.getState().activeJob?.doneQty).toBe(0)
  })

  // Regression: fix for phantom-grant bug. Grant must fire AFTER the state commit,
  // not before — otherwise a bailed set() would still emit side effects.
  it('fires onGrant AFTER state commit — doneQty reflects advance at grant time', () => {
    const job = buildJob({ startedAt: 1_000_000 })
    useCraftingStore.setState({ activeJob: job })
    let doneQtyAtGrant: number | undefined
    const onGrant = vi.fn(() => {
      doneQtyAtGrant = useCraftingStore.getState().activeJob?.doneQty
    })
    useCraftingStore.getState().tick(1_002_000, onGrant)
    expect(onGrant).toHaveBeenCalledTimes(1)
    // doneQty already 2 at the moment onGrant fires — proves commit-then-grant order.
    expect(doneQtyAtGrant).toBe(2)
  })

  it('completes job and promotes next queued job on final tick', () => {
    const active = buildJob({ id: 'job_a', totalQty: 2, startedAt: 1_000_000 })
    const queued = buildJob({ id: 'job_b', totalQty: 3, startedAt: 0 })
    useCraftingStore.setState({ activeJob: active, queue: [queued] })
    const onGrant = vi.fn()
    useCraftingStore.getState().tick(1_005_000, onGrant) // 5s → completes 2 + promotes
    expect(onGrant).toHaveBeenCalledTimes(1)
    const state = useCraftingStore.getState()
    expect(state.activeJob?.id).toBe('job_b')
    expect(state.activeJob?.doneQty).toBe(0)
    expect(state.queue).toEqual([])
  })
})
