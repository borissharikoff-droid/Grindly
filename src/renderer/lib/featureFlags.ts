function readFlag(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  const raw = localStorage.getItem(`grindly_flag_${key}`)
  if (raw === null) return fallback
  return raw === '1' || raw === 'true'
}

export const FEATURE_FLAGS = {
  progressTimeline: readFlag('progress_timeline', true),
  socialFeed: readFlag('social_feed', true),
  skillCompetitions: readFlag('skill_competitions', true),
} as const
