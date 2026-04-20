import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Memory localStorage polyfill (node test env has no window.localStorage).
function setupMemoryStorage() {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      get length() { return store.size },
      clear() { store.clear() },
      getItem(key: string) { return store.has(key) ? store.get(key)! : null },
      key(i: number) { return Array.from(store.keys())[i] ?? null },
      removeItem(key: string) { store.delete(key) },
      setItem(key: string, value: string) { store.set(key, String(value)) },
    },
    configurable: true,
  })
}

const rpcMock = vi.fn()
vi.mock('../renderer/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}))
vi.mock('../renderer/stores/achievementStatsStore', () => ({
  useAchievementStatsStore: { getState: () => ({ updateMaxGold: vi.fn() }) },
}))

describe('goldStore — basic invariants', () => {
  beforeEach(async () => {
    if (!('localStorage' in globalThis)) setupMemoryStorage()
    vi.resetModules()
    rpcMock.mockReset()
  })

  it('setGold clamps negative values to 0', async () => {
    const { useGoldStore } = await import('../renderer/stores/goldStore')
    useGoldStore.getState().setGold(-50)
    expect(useGoldStore.getState().gold).toBe(0)
  })

  it('addGold accumulates positive deltas', async () => {
    const { useGoldStore } = await import('../renderer/stores/goldStore')
    useGoldStore.getState().addGold(100)
    useGoldStore.getState().addGold(50)
    expect(useGoldStore.getState().gold).toBe(150)
  })

  it('addGold clamps gold at 0 when subtracting past zero', async () => {
    const { useGoldStore } = await import('../renderer/stores/goldStore')
    useGoldStore.setState({ gold: 30 })
    useGoldStore.getState().addGold(-100)
    expect(useGoldStore.getState().gold).toBe(0)
  })
})

describe('goldStore — delta-based syncToSupabase', () => {
  beforeEach(() => {
    if (!('localStorage' in globalThis)) setupMemoryStorage()
    vi.resetModules()
    rpcMock.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => { vi.useRealTimers() })

  it('sends accumulated delta and applies authoritative server total', async () => {
    const { useGoldStore } = await import('../renderer/stores/goldStore')
    rpcMock.mockResolvedValueOnce({ data: 250, error: null })
    useGoldStore.getState().addGold(100)
    const p = useGoldStore.getState().syncToSupabase('user_a')
    vi.advanceTimersByTime(600)
    await p
    expect(rpcMock).toHaveBeenCalledWith('sync_gold_delta', { p_delta: 100 })
    // Server returned 250 (e.g. another device had 150 already).
    expect(useGoldStore.getState().gold).toBe(250)
  })

  it('re-applies local deltas accumulated during RPC flight so concurrent earnings are not lost', async () => {
    const { useGoldStore } = await import('../renderer/stores/goldStore')
    rpcMock.mockImplementationOnce(async () => {
      // While RPC is in-flight, user earns more gold locally.
      useGoldStore.getState().addGold(25)
      return { data: 100, error: null }
    })
    useGoldStore.getState().addGold(50)
    const p = useGoldStore.getState().syncToSupabase('user_a')
    vi.advanceTimersByTime(600)
    await p
    // Server said 100, but 25 accumulated during flight → final 125
    expect(useGoldStore.getState().gold).toBe(125)
  })

  it('re-queues delta on RPC error so retries preserve earnings', async () => {
    const { useGoldStore } = await import('../renderer/stores/goldStore')
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'network' } })
    useGoldStore.getState().addGold(75)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const p = useGoldStore.getState().syncToSupabase('user_a')
    vi.advanceTimersByTime(600)
    await p
    // Local gold unchanged (no server total applied)
    expect(useGoldStore.getState().gold).toBe(75)
    // Next successful sync should resend the full 75 delta
    rpcMock.mockResolvedValueOnce({ data: 200, error: null })
    const p2 = useGoldStore.getState().syncToSupabase('user_a')
    vi.advanceTimersByTime(600)
    await p2
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'sync_gold_delta', { p_delta: 75 })
    warn.mockRestore()
  })

  it('debounces multiple syncToSupabase calls into one RPC', async () => {
    const { useGoldStore } = await import('../renderer/stores/goldStore')
    rpcMock.mockResolvedValueOnce({ data: 30, error: null })
    useGoldStore.getState().addGold(10)
    useGoldStore.getState().syncToSupabase('user_a')
    useGoldStore.getState().addGold(20)
    const p = useGoldStore.getState().syncToSupabase('user_a')
    vi.advanceTimersByTime(600)
    await p
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('sync_gold_delta', { p_delta: 30 })
  })
})
