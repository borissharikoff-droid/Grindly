const METRICS_STORAGE_KEY = 'grindly_rollout_metrics'

export type RolloutMetricKey =
  | 'progress_timeline_open'
  | 'progress_filter_changed'
  | 'achievement_claimed'
  | 'competition_viewed'
  | 'competition_skill_changed'
  | 'friends_feed_viewed'

type MetricsMap = Record<string, number>

function readMetrics(): MetricsMap {
  try {
    const parsed = JSON.parse(localStorage.getItem(METRICS_STORAGE_KEY) || '{}') as MetricsMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function trackMetric(key: RolloutMetricKey, by = 1): void {
  const metrics = readMetrics()
  metrics[key] = (metrics[key] || 0) + by
  try {
    localStorage.setItem(METRICS_STORAGE_KEY, JSON.stringify(metrics))
  } catch {
    // noop
  }
}

export function readRolloutMetrics(): MetricsMap {
  return readMetrics()
}
