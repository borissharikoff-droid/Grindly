/**
 * Feature flags — simple localStorage-backed toggles for gradual rollout.
 *
 * Usage:
 *   isFlagEnabled('delve_enabled') → reads localStorage.getItem('grindly_flag_delve_enabled')
 *   Toggle at runtime (e.g. DevTools console):
 *     localStorage.setItem('grindly_flag_delve_enabled', '1')
 *   Disable:
 *     localStorage.removeItem('grindly_flag_delve_enabled')
 */

export type FeatureFlag = 'delve_enabled'

const FLAG_PREFIX = 'grindly_flag_'

export function isFlagEnabled(flag: FeatureFlag): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    const raw = localStorage.getItem(`${FLAG_PREFIX}${flag}`)
    return raw === '1' || raw === 'true'
  } catch {
    return false
  }
}

export function setFlag(flag: FeatureFlag, enabled: boolean): void {
  if (typeof localStorage === 'undefined') return
  const key = `${FLAG_PREFIX}${flag}`
  try {
    if (enabled) localStorage.setItem(key, '1')
    else localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}
