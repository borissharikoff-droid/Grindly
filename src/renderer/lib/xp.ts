import { ACHIEVEMENT_XP_REWARDS, CATEGORY_XP_MULTIPLIER_CONFIG, STREAK_MULTIPLIERS } from './rewardConfig'

// ── Progressive Leveling Curve ──
// Levels 1-10: 50 XP each (500 XP total to reach LVL 11)
// Levels 11-25: 100 XP each
// Levels 26-50: 200 XP each
// Levels 51+: 400 XP each

/** XP required to advance from this level to the next */
export function xpRequiredForLevel(level: number): number {
  if (level <= 10) return 50
  if (level <= 25) return 100
  if (level <= 50) return 200
  return 400
}

/** Cumulative XP required to reach this level (XP at start of level) */
export function totalXPForLevel(level: number): number {
  if (level <= 1) return 0
  let total = 0
  for (let lv = 1; lv < level; lv++) {
    total += xpRequiredForLevel(lv)
  }
  return total
}

export function levelFromTotalXP(totalXP: number): number {
  if (totalXP < 0) return 1
  let level = 1
  let xpRemaining = totalXP
  while (xpRemaining >= xpRequiredForLevel(level)) {
    xpRemaining -= xpRequiredForLevel(level)
    level++
  }
  return level
}

export function xpProgressInLevel(totalXP: number): { current: number; needed: number } {
  const level = levelFromTotalXP(totalXP)
  const xpAtLevelStart = totalXPForLevel(level)
  const current = totalXP - xpAtLevelStart
  const needed = xpRequiredForLevel(level)
  return { current, needed }
}

// ── Level Rewards: Titles + Cosmetics ──
export interface LevelReward {
  level: number
  title?: string
  avatar?: string
  frameId?: string
  badgeId?: string
}

export const LEVEL_REWARDS: LevelReward[] = [
  { level: 1, title: 'Newbie' },
  { level: 5, title: 'Rookie', avatar: '🎯' },
  { level: 10, title: 'Grindly' },
  { level: 15, title: 'Dedicated' },
  { level: 20, title: 'Veteran', avatar: '🏆' },
  { level: 25, title: 'Expert' },
  { level: 30, title: 'Master' },
  { level: 40, title: 'Grandmaster' },
  { level: 50, title: 'Legend', avatar: '🌠' },
  { level: 75, title: 'Mythic' },
  { level: 99, title: 'Transcendent' },
]

/** Get the title for a given level (highest title at or below this level) */
export function getTitleForLevel(level: number): string {
  let title = 'Newbie'
  for (const reward of LEVEL_REWARDS) {
    if (reward.level <= level && reward.title) {
      title = reward.title
    }
  }
  return title
}

/** Get rewards unlocked at exactly this level */
export function getRewardsForLevel(level: number): LevelReward | undefined {
  return LEVEL_REWARDS.find(r => r.level === level)
}

/** Get all rewards unlocked between fromLevel (exclusive) and toLevel (inclusive) */
export function getRewardsInRange(fromLevel: number, toLevel: number): LevelReward[] {
  return LEVEL_REWARDS.filter(r => r.level > fromLevel && r.level <= toLevel)
}

/** Returns streak-based XP multiplier */
export function getStreakMultiplier(streak: number): number {
  if (streak >= 30) return STREAK_MULTIPLIERS.day30
  if (streak >= 14) return STREAK_MULTIPLIERS.day14
  if (streak >= 7) return STREAK_MULTIPLIERS.day7
  if (streak >= 2) return STREAK_MULTIPLIERS.day2
  return 1.0
}

export const CATEGORY_XP_MULTIPLIER: Record<string, number> = CATEGORY_XP_MULTIPLIER_CONFIG

export function computeSessionXP(
  durationSeconds: number,
  activities: { category: string | null; start_time: number; end_time: number }[]
): number {
  let weighted = 0
  for (const a of activities) {
    if (a.category === 'idle') continue // only selected (focused) app windows give XP
    const sec = (a.end_time - a.start_time) / 1000
    const mult = CATEGORY_XP_MULTIPLIER[a.category || 'other'] ?? 0.5
    weighted += sec * mult
  }
  if (weighted === 0) weighted = durationSeconds * 0.5
  return Math.round(weighted / 60)
}

export type RewardType = 'avatar' | 'badge' | 'title' | 'skill_boost' | 'profile_frame'

export interface AchievementReward {
  type: RewardType
  value: string   // emoji for avatar, text for title, emoji for badge, skill id for skill_boost, frame id for profile_frame
  label: string   // human readable description
}

export interface AchievementDef {
  id: string
  name: string
  description: string
  icon: string
  xpReward: number
  /** Where XP reward is applied. Global XP is deprecated; use skill-only progression. */
  xpDestination?: 'skill'
  reward?: AchievementReward
  category: 'grind' | 'streak' | 'social' | 'special' | 'skill'
}

export interface AchievementProgressContext {
  totalSessions: number
  streakCount: number
  friendCount: number
  skillLevels: Record<string, number>
}

export interface AchievementProgress {
  current: number
  target: number
  label: string
  complete: boolean
}

const ACHIEVEMENTS_BASE: AchievementDef[] = [
  // Grind achievements
  {
    id: 'first_session',
    name: 'First Steps',
    description: 'Complete your first grind session',
    icon: '🚀',
    xpReward: 10,
    reward: { type: 'avatar', value: '🚀', label: 'Rocket avatar unlocked' },
    category: 'grind',
  },
  {
    id: 'code_warrior',
    name: 'Code Warrior',
    description: '2+ hours of coding in one session',
    icon: '⚔️',
    xpReward: 50,
    reward: { type: 'avatar', value: '⚔️', label: 'Warrior avatar unlocked' },
    category: 'grind',
  },
  {
    id: 'marathon',
    name: 'Marathon',
    description: '2+ hours without a break',
    icon: '🏃',
    xpReward: 40,
    reward: { type: 'avatar', value: '🏃', label: 'Marathon avatar unlocked' },
    category: 'grind',
  },
  {
    id: 'ten_sessions',
    name: 'Dedicated',
    description: 'Complete 10 sessions',
    icon: '💎',
    xpReward: 75,
    reward: { type: 'profile_frame', value: 'diamond', label: 'Diamond frame unlocked' },
    category: 'grind',
  },
  {
    id: 'fifty_sessions',
    name: 'Grind Lord',
    description: 'Complete 50 sessions',
    icon: '👑',
    xpReward: 200,
    reward: { type: 'profile_frame', value: 'crown', label: 'Crown frame unlocked' },
    category: 'grind',
  },

  // Streak achievements
  {
    id: 'streak_2',
    name: 'On Fire',
    description: '2 day streak',
    icon: '🔥',
    xpReward: 20,
    reward: { type: 'badge', value: '🔥', label: 'Fire badge' },
    category: 'streak',
  },
  {
    id: 'streak_7',
    name: 'Streak Master',
    description: '7 day streak',
    icon: '⚡',
    xpReward: 100,
    reward: { type: 'profile_frame', value: 'ember', label: 'Ember frame unlocked' },
    category: 'streak',
  },
  {
    id: 'streak_14',
    name: 'Streak Legend',
    description: '14 day streak',
    icon: '🔥',
    xpReward: 150,
    reward: { type: 'profile_frame', value: 'blaze', label: 'Blaze frame unlocked' },
    category: 'streak',
  },
  {
    id: 'streak_30',
    name: 'Unstoppable',
    description: '30 day streak',
    icon: '🌟',
    xpReward: 300,
    reward: { type: 'avatar', value: '🌟', label: 'Star avatar unlocked' },
    category: 'streak',
  },

  // Time-based
  {
    id: 'night_owl',
    name: 'Night Owl',
    description: 'Session after midnight',
    icon: '🦉',
    xpReward: 25,
    reward: { type: 'avatar', value: '🦉', label: 'Owl avatar unlocked' },
    category: 'special',
  },
  {
    id: 'early_bird',
    name: 'Early Bird',
    description: 'Session before 7 AM',
    icon: '🐦',
    xpReward: 25,
    reward: { type: 'avatar', value: '🐦', label: 'Bird avatar unlocked' },
    category: 'special',
  },

  // Social achievements
  {
    id: 'first_friend',
    name: 'Squad Up',
    description: 'Add your first friend',
    icon: '🤝',
    xpReward: 15,
    reward: { type: 'avatar', value: '🤝', label: 'Handshake avatar unlocked' },
    category: 'social',
  },
  {
    id: 'five_friends',
    name: 'Popular',
    description: 'Have 5 friends',
    icon: '🌐',
    xpReward: 50,
    reward: { type: 'avatar', value: '🌐', label: 'Globe avatar unlocked' },
    category: 'social',
  },
  {
    id: 'social_butterfly',
    name: 'Social Butterfly',
    description: 'Have 10 friends',
    icon: '🦋',
    xpReward: 100,
    reward: { type: 'avatar', value: '🦋', label: 'Butterfly avatar unlocked' },
    category: 'social',
  },

  // Skill-based achievements
  { id: 'skill_developer_10', name: 'Coding Intern', description: 'Developer LVL 10', icon: '💻', xpReward: 30, xpDestination: 'skill', reward: { type: 'skill_boost', value: 'developer', label: '+30 min Developer XP' }, category: 'skill' },
  { id: 'skill_developer_50', name: 'Full Stack', description: 'Developer LVL 50', icon: '⚡', xpReward: 100, xpDestination: 'skill', reward: { type: 'profile_frame', value: 'code', label: 'Code frame unlocked' }, category: 'skill' },
  { id: 'skill_developer_99', name: '10x Engineer', description: 'Developer LVL 99', icon: '👑', xpReward: 500, xpDestination: 'skill', reward: { type: 'avatar', value: '🧠', label: 'Architect avatar' }, category: 'skill' },
  { id: 'skill_designer_10', name: 'Pixel Pusher', description: 'Designer LVL 10', icon: '🎨', xpReward: 30, xpDestination: 'skill', reward: { type: 'skill_boost', value: 'designer', label: '+30 min Designer XP' }, category: 'skill' },
  { id: 'skill_designer_50', name: 'Art Director', description: 'Designer LVL 50', icon: '🖌️', xpReward: 100, xpDestination: 'skill', reward: { type: 'profile_frame', value: 'art', label: 'Art frame unlocked' }, category: 'skill' },
  { id: 'skill_gamer_25', name: 'Pro Gamer', description: 'Gamer LVL 25', icon: '🎮', xpReward: 50, xpDestination: 'skill', reward: { type: 'skill_boost', value: 'gamer', label: '+30 min Gamer XP' }, category: 'skill' },
  { id: 'polymath', name: 'Polymath', description: '3 skills at LVL 25+', icon: '🌟', xpReward: 80, xpDestination: 'skill', reward: { type: 'profile_frame', value: 'star', label: 'Star frame unlocked' }, category: 'skill' },
  { id: 'jack_of_all_trades', name: 'Jack of All Trades', description: 'All skills at LVL 10+', icon: '🔮', xpReward: 200, xpDestination: 'skill', reward: { type: 'avatar', value: '🔮', label: 'Crystal avatar' }, category: 'skill' },
]

export const ACHIEVEMENTS: AchievementDef[] = ACHIEVEMENTS_BASE.map((achievement) => ({
  ...achievement,
  xpReward: ACHIEVEMENT_XP_REWARDS[achievement.id] ?? achievement.xpReward,
}))

export function getAchievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id)
}

export function getAchievementProgress(
  achievementId: string,
  ctx: AchievementProgressContext,
): AchievementProgress | null {
  const safeSessions = Math.max(0, ctx.totalSessions || 0)
  const safeStreak = Math.max(0, ctx.streakCount || 0)
  const safeFriends = Math.max(0, ctx.friendCount || 0)
  const levels = ctx.skillLevels || {}
  const skills25 = Object.values(levels).filter((lv) => lv >= 25).length
  const baseSkills = ['developer', 'designer', 'gamer', 'communicator', 'researcher', 'creator', 'learner', 'listener']
  const skills10 = baseSkills.filter((id) => (levels[id] || 0) >= 10).length

  const fixed = (current: number, target: number, suffix: string): AchievementProgress => ({
    current: Math.min(target, current),
    target,
    label: `${Math.min(target, current)}/${target} ${suffix}`,
    complete: current >= target,
  })

  switch (achievementId) {
    case 'first_session': return fixed(safeSessions, 1, 'sessions')
    case 'ten_sessions': return fixed(safeSessions, 10, 'sessions')
    case 'fifty_sessions': return fixed(safeSessions, 50, 'sessions')
    case 'streak_2': return fixed(safeStreak, 2, 'streak days')
    case 'streak_7': return fixed(safeStreak, 7, 'streak days')
    case 'streak_14': return fixed(safeStreak, 14, 'streak days')
    case 'streak_30': return fixed(safeStreak, 30, 'streak days')
    case 'first_friend': return fixed(safeFriends, 1, 'friends')
    case 'five_friends': return fixed(safeFriends, 5, 'friends')
    case 'social_butterfly': return fixed(safeFriends, 10, 'friends')
    case 'skill_developer_10': return fixed(levels.developer || 0, 10, 'developer levels')
    case 'skill_developer_50': return fixed(levels.developer || 0, 50, 'developer levels')
    case 'skill_developer_99': return fixed(levels.developer || 0, 99, 'developer levels')
    case 'skill_designer_10': return fixed(levels.designer || 0, 10, 'designer levels')
    case 'skill_designer_50': return fixed(levels.designer || 0, 50, 'designer levels')
    case 'skill_gamer_25': return fixed(levels.gamer || 0, 25, 'gamer levels')
    case 'polymath': return fixed(skills25, 3, 'skills LVL 25+')
    case 'jack_of_all_trades': return fixed(skills10, baseSkills.length, 'skills LVL 10+')
    default:
      return null
  }
}

/** Reward label for skill milestone at this level (e.g. "Coding Intern" at Developer LVL 10), or undefined. */
export function getSkillMilestoneReward(skillId: string, level: number): string | undefined {
  const def = getAchievementById(`skill_${skillId}_${level}`)
  return def?.reward?.label
}

export function checkNewAchievements(
  session: { duration_seconds: number; start_time: number },
  activities: { category: string | null; start_time: number; end_time: number }[],
  streak: number,
  totalSessions: number,
  alreadyUnlocked: string[]
): { id: string; def: AchievementDef }[] {
  const newOnes: { id: string; def: AchievementDef }[] = []
  const codingSeconds = activities
    .filter((a) => a.category === 'coding')
    .reduce((s, a) => s + (a.end_time - a.start_time) / 1000, 0)
  const startHour = new Date(session.start_time).getHours()

  const checks: { id: string; pass: boolean }[] = [
    { id: 'first_session', pass: totalSessions >= 1 },
    { id: 'code_warrior', pass: codingSeconds >= 7200 },
    { id: 'streak_2', pass: streak >= 2 },
    { id: 'streak_7', pass: streak >= 7 },
    { id: 'streak_14', pass: streak >= 14 },
    { id: 'streak_30', pass: streak >= 30 },
    { id: 'marathon', pass: session.duration_seconds >= 7200 },
    { id: 'night_owl', pass: startHour >= 0 && startHour < 5 },
    { id: 'early_bird', pass: startHour >= 4 && startHour < 7 },
    { id: 'ten_sessions', pass: totalSessions >= 10 },
    { id: 'fifty_sessions', pass: totalSessions >= 50 },
  ]

  for (const { id, pass } of checks) {
    if (pass && !alreadyUnlocked.includes(id)) {
      const def = getAchievementById(id)
      if (def) newOnes.push({ id, def })
    }
  }
  return newOnes
}

/** Check social achievements based on current friend count */
export function checkSocialAchievements(
  friendCount: number,
  alreadyUnlocked: string[]
): { id: string; def: AchievementDef }[] {
  const newOnes: { id: string; def: AchievementDef }[] = []
  const checks: { id: string; pass: boolean }[] = [
    { id: 'first_friend', pass: friendCount >= 1 },
    { id: 'five_friends', pass: friendCount >= 5 },
    { id: 'social_butterfly', pass: friendCount >= 10 },
  ]
  for (const { id, pass } of checks) {
    if (pass && !alreadyUnlocked.includes(id)) {
      const def = getAchievementById(id)
      if (def) newOnes.push({ id, def })
    }
  }
  return newOnes
}

/** Check skill-based achievements. skillLevels: skillId -> level (1-99) */
export function checkSkillAchievements(
  skillLevels: Record<string, number>,
  alreadyUnlocked: string[]
): { id: string; def: AchievementDef }[] {
  const newOnes: { id: string; def: AchievementDef }[] = []
  const dev = skillLevels.developer ?? 0
  const des = skillLevels.designer ?? 0
  const gam = skillLevels.gamer ?? 0
  const levels = Object.values(skillLevels)
  const atLeast25 = levels.filter((l) => l >= 25).length
  const skillIds = ['developer', 'designer', 'gamer', 'communicator', 'researcher', 'creator', 'learner', 'listener']
  const allAtLeast10 = skillIds.every((id) => (skillLevels[id] ?? 0) >= 10)

  const checks: { id: string; pass: boolean }[] = [
    { id: 'skill_developer_10', pass: dev >= 10 },
    { id: 'skill_developer_50', pass: dev >= 50 },
    { id: 'skill_developer_99', pass: dev >= 99 },
    { id: 'skill_designer_10', pass: des >= 10 },
    { id: 'skill_designer_50', pass: des >= 50 },
    { id: 'skill_gamer_25', pass: gam >= 25 },
    { id: 'polymath', pass: atLeast25 >= 3 },
    { id: 'jack_of_all_trades', pass: allAtLeast10 },
  ]
  for (const { id, pass } of checks) {
    if (pass && !alreadyUnlocked.includes(id)) {
      const def = getAchievementById(id)
      if (def) newOnes.push({ id, def })
    }
  }
  return newOnes
}
