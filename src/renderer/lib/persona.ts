export interface PersonaResult {
  id: string
  label: string
  emoji: string
  description: string
}

const PERSONAS: PersonaResult[] = [
  { id: 'developer', label: 'Builder', emoji: '💻', description: 'Most time goes to coding tools' },
  { id: 'creative', label: 'Creator', emoji: '🎨', description: 'Most time goes to creative work' },
  { id: 'gamer', label: 'Player', emoji: '🎮', description: 'A large share goes to games' },
  { id: 'social', label: 'Communicator', emoji: '💬', description: 'A large share goes to social apps' },
  { id: 'explorer', label: 'Explorer', emoji: '🌐', description: 'Most time goes to browsing' },
  { id: 'music_lover', label: 'Listener', emoji: '🎵', description: 'A large share goes to music apps' },
  { id: 'scholar', label: 'Learner', emoji: '📚', description: 'A large share goes to learning tools' },
  { id: 'grindly', label: 'Balanced', emoji: '⚡', description: 'Your activity is mixed across categories' },
]

/**
 * Detect persona from category distribution
 * @param categories - { category: string; total_ms: number }[]
 */
export function detectPersona(
  categories: { category: string; total_ms: number }[]
): PersonaResult {
  if (categories.length === 0) return PERSONAS[7] // default: grindly

  const total = categories.reduce((sum, c) => sum + c.total_ms, 0)
  if (total === 0) return PERSONAS[7]

  const byCategory: Record<string, number> = {}
  for (const c of categories) {
    byCategory[c.category] = (byCategory[c.category] || 0) + c.total_ms
  }

  const pct = (cat: string) => ((byCategory[cat] || 0) / total) * 100

  // Determine dominant persona
  if (pct('coding') >= 40) return PERSONAS[0]   // developer
  if (pct('creative') >= 25) return PERSONAS[1] // creative
  if (pct('games') >= 30) return PERSONAS[2]   // gamer
  if (pct('social') >= 30) return PERSONAS[3]   // social
  if (pct('browsing') >= 40) return PERSONAS[4] // explorer
  if (pct('music') >= 25) return PERSONAS[5]   // music lover
  if (pct('learning') >= 25) return PERSONAS[6] // scholar

  // Mixed — return grindly
  return PERSONAS[7]
}

/** Get persona by id (for displaying friend status from stored persona_id). */
export function getPersonaById(id: string | null): PersonaResult | null {
  if (!id) return null
  return PERSONAS.find((p) => p.id === id) ?? null
}

export interface Insight {
  icon: string
  text: string
  type: 'tip' | 'praise' | 'warning' | 'info'
}

/**
 * Generate smart, brief insights from activity data
 */
export function generateInsights(params: {
  appUsage: { app_name: string; category: string; total_ms: number }[]
  categoryStats: { category: string; total_ms: number }[]
  contextSwitches: number
  totalSessions: number
  totalSeconds: number
  streak: number
}): Insight[] {
  const { appUsage, categoryStats, contextSwitches, totalSessions, totalSeconds, streak } = params
  const insights: Insight[] = []
  const totalMs = categoryStats.reduce((s, c) => s + c.total_ms, 0)

  if (totalMs === 0 || totalSessions === 0) return insights

  const avgSessionMin = Math.round(totalSeconds / totalSessions / 60)

  // Category percentages
  const catPct: Record<string, number> = {}
  for (const c of categoryStats) {
    catPct[c.category] = (c.total_ms / totalMs) * 100
  }

  // Context switch insight
  const switchesPerSession = totalSessions > 0 ? contextSwitches / totalSessions : 0
  if (switchesPerSession > 15) {
    insights.push({
      icon: '🔄',
      text: `${Math.round(switchesPerSession)} app switches per session. Fewer switches usually improves focus.`,
      type: 'warning',
    })
  } else if (switchesPerSession < 5 && totalSessions >= 2) {
    insights.push({
      icon: '🎯',
      text: 'Low app switching. Your sessions look steady and focused.',
      type: 'praise',
    })
  }

  // Coding insight
  if ((catPct.coding || 0) >= 50) {
    insights.push({
      icon: '💻',
      text: `${Math.round(catPct.coding)}% of time in coding tools. Strong execution focus.`,
      type: 'praise',
    })
  } else if ((catPct.coding || 0) > 0 && (catPct.coding || 0) < 20) {
    insights.push({
      icon: '⌨️',
      text: `Only ${Math.round(catPct.coding || 0)}% in coding tools. Consider longer build sessions.`,
      type: 'tip',
    })
  }

  // Social overuse
  if ((catPct.social || 0) >= 30) {
    insights.push({
      icon: '💬',
      text: `${Math.round(catPct.social)}% in social apps. Muting notifications may reduce interruptions.`,
      type: 'warning',
    })
  }

  // Gaming during grind
  if ((catPct.games || 0) >= 20) {
    insights.push({
      icon: '🎮',
      text: `${Math.round(catPct.games)}% in games during tracked sessions. Consider separating work and play windows.`,
      type: 'tip',
    })
  }

  // Music
  if ((catPct.music || 0) >= 10 && (catPct.music || 0) < 40) {
    insights.push({
      icon: '🎵',
      text: 'Music usage is moderate and may support a steady rhythm.',
      type: 'praise',
    })
  }

  // Top app dominance
  if (appUsage.length > 0) {
    const topApp = appUsage[0]
    const topPct = (topApp.total_ms / totalMs) * 100
    if (topPct >= 60) {
      insights.push({
        icon: '🏠',
        text: `${topApp.app_name} accounts for ${Math.round(topPct)}% of tracked time.`,
        type: 'info',
      })
    }
  }

  // Session length
  if (avgSessionMin >= 60) {
    insights.push({
      icon: '⏱️',
      text: `Average session length is ${avgSessionMin} minutes. Great sustained focus.`,
      type: 'praise',
    })
  } else if (avgSessionMin < 15 && totalSessions >= 3) {
    insights.push({
      icon: '⏱️',
      text: `Average session length is ${avgSessionMin} minutes. Longer blocks can improve depth of work.`,
      type: 'tip',
    })
  }

  // Streak
  if (streak >= 7) {
    insights.push({
      icon: '🔥',
      text: `${streak}-day consistency streak. Strong habit momentum.`,
      type: 'praise',
    })
  } else if (streak >= 2) {
    insights.push({
      icon: '🔥',
      text: `${streak}-day consistency streak. Keep it going.`,
      type: 'info',
    })
  }

  return insights.slice(0, 4) // max 4 insights
}
