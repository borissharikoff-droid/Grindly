import { supabase } from '../lib/supabase'

export interface SupabaseHealthResult {
  ok: boolean
  checks: Array<{ name: string; ok: boolean; detail: string }>
}

export async function runSupabaseHealthCheck(): Promise<SupabaseHealthResult> {
  const checks: SupabaseHealthResult['checks'] = []

  // Lightweight reachability check — no write operations, no destructive queries
  const reachCheck = await supabase
    .from('profiles')
    .select('id', { head: true, count: 'exact' })
    .limit(1)

  checks.push({
    name: 'api_reachable',
    ok: !reachCheck.error,
    detail: reachCheck.error?.message ?? 'reachable',
  })

  return {
    ok: checks.every((c) => c.ok),
    checks,
  }
}
