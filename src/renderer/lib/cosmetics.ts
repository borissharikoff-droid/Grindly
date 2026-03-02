// ─── BADGES ───────────────────────────────────────────────
// Badges are small profile decorations visible to friends and on leaderboards.
// Unlocked through achievements or special events.

export interface Badge {
  id: string
  name: string
  label: string       // short text shown on badge
  icon: string
  color: string
  description: string
  unlockHint: string   // shown when locked
  achievementId?: string // linked to an achievement
}

export const BADGES: Badge[] = [
  {
    id: 'fire',
    name: 'On Fire',
    label: 'FIRE',
    icon: '🔥',
    color: '#FF6B35',
    description: '2-day streak achieved',
    unlockHint: 'Get a 2-day streak',
    achievementId: 'streak_2',
  },
  {
    id: 'night_owl',
    name: 'Night Owl',
    label: 'OWL',
    icon: '🦉',
    color: '#5C6BC0',
    description: 'Grinds after midnight',
    unlockHint: 'Start a session past midnight',
    achievementId: 'night_owl',
  },
  {
    id: 'early_bird',
    name: 'Early Bird',
    label: 'EARLY',
    icon: '🐦',
    color: '#FFB74D',
    description: 'Grinds before 7 AM',
    unlockHint: 'Start a session before 7 AM',
    achievementId: 'early_bird',
  },
  {
    id: 'social',
    name: 'Social Butterfly',
    label: 'SOCIAL',
    icon: '🦋',
    color: '#CE93D8',
    description: '10 friends added',
    unlockHint: 'Add 10 friends',
    achievementId: 'social_butterfly',
  },
]

// ─── FRAMES ──────────────────────────────────────────────
// Frames are avatar borders. Limited/rare, only from specific achievements.

export type FrameStyle = 'pixel' | 'broken' | 'matrix' | 'liquid' | 'glitch' | 'holographic' | 'flame' | 'royal'

export interface Frame {
  id: string
  name: string
  color: string
  gradient: string
  rarity: 'Rare' | 'Epic' | 'Legendary'
  style: FrameStyle
  unlockHint: string
  achievementId?: string
}

export const FRAMES: Frame[] = [
  {
    id: 'diamond',
    name: 'Diamond',
    color: '#4FC3F7',
    gradient: 'linear-gradient(135deg, #4FC3F7 0%, #E1F5FE 40%, #4FC3F7 100%)',
    rarity: 'Rare',
    style: 'pixel',
    unlockHint: 'Complete 10 sessions',
    achievementId: 'ten_sessions',
  },
  {
    id: 'ember',
    name: 'Ember',
    color: '#FF8A65',
    gradient: 'linear-gradient(135deg, #FF8A65 0%, #FF5722 50%, #BF360C 100%)',
    rarity: 'Rare',
    style: 'broken',
    unlockHint: '7-day streak',
    achievementId: 'streak_7',
  },
  {
    id: 'code',
    name: 'Code',
    color: '#00FF88',
    gradient: 'linear-gradient(135deg, #00FF88 0%, #00B4D8 100%)',
    rarity: 'Epic',
    style: 'matrix',
    unlockHint: 'Developer LVL 50',
    achievementId: 'skill_developer_50',
  },
  {
    id: 'art',
    name: 'Art',
    color: '#FF6B9D',
    gradient: 'linear-gradient(135deg, #FF6B9D 0%, #C084FC 100%)',
    rarity: 'Epic',
    style: 'liquid',
    unlockHint: 'Designer LVL 50',
    achievementId: 'skill_designer_50',
  },
  {
    id: 'blaze',
    name: 'Blaze',
    color: '#FF6D00',
    gradient: 'linear-gradient(135deg, #FF6D00 0%, #FF3D00 40%, #DD2C00 70%, #FFD740 100%)',
    rarity: 'Epic',
    style: 'glitch',
    unlockHint: '14-day streak',
    achievementId: 'streak_14',
  },
  {
    id: 'star',
    name: 'Star',
    color: '#FFD700',
    gradient: 'linear-gradient(135deg, #FFD700 0%, #FF6B35 50%, #FF1493 100%)',
    rarity: 'Legendary',
    style: 'holographic',
    unlockHint: '3 skills at LVL 25+',
    achievementId: 'polymath',
  },
  {
    id: 'fire',
    name: 'Inferno',
    color: '#FF4500',
    gradient: 'linear-gradient(135deg, #FF4500 0%, #FFD700 50%, #FF6B35 100%)',
    rarity: 'Legendary',
    style: 'flame',
    unlockHint: '30-day streak',
    achievementId: 'streak_30',
  },
  {
    id: 'crown',
    name: 'Crown',
    color: '#FFD700',
    gradient: 'linear-gradient(135deg, #FFD700 0%, #FFA000 40%, #FF6F00 100%)',
    rarity: 'Legendary',
    style: 'royal',
    unlockHint: 'Complete 50 sessions',
    achievementId: 'fifty_sessions',
  },
]

// ─── LOCKED AVATARS ──────────────────────────────────────
// Some avatars require achievements to unlock.

export const FREE_AVATARS = ['🐺', '🦊', '🐱', '🐼', '🐸', '🤖']

export const LOCKED_AVATARS: { emoji: string; unlockHint: string; achievementId: string }[] = [
  { emoji: '🦁', unlockHint: '2h+ session', achievementId: 'marathon' },
  { emoji: '🦉', unlockHint: 'Night Owl', achievementId: 'night_owl' },
  { emoji: '🐤', unlockHint: 'Early Bird', achievementId: 'early_bird' },
]

type AchievementCosmeticUnlock = {
  badgeId?: string
  frameId?: string
  avatarEmoji?: string
}

/**
 * Canonical source of achievement -> cosmetic unlock mapping.
 * Keep one strong cosmetic unlock per milestone unless intentionally tiered.
 */
export const ACHIEVEMENT_COSMETIC_UNLOCKS: Record<string, AchievementCosmeticUnlock> = {
  streak_2: { badgeId: 'fire' },
  streak_7: { frameId: 'ember' },
  streak_14: { frameId: 'blaze' },
  streak_30: { frameId: 'fire' },
  night_owl: { badgeId: 'night_owl' },
  early_bird: { badgeId: 'early_bird' },
  ten_sessions: { frameId: 'diamond' },
  fifty_sessions: { frameId: 'crown' },
  marathon: { avatarEmoji: '🦁' },
  social_butterfly: { badgeId: 'social' },
  skill_developer_50: { frameId: 'code' },
  skill_designer_50: { frameId: 'art' },
  polymath: { frameId: 'star' },
}

// ─── LOCAL STORAGE HELPERS ────────────────────────────────

const STORAGE_BADGES = 'grindly_equipped_badges'
const STORAGE_FRAME = 'grindly_equipped_frame'
const STORAGE_UNLOCKED_BADGES = 'grindly_unlocked_badges'
const STORAGE_UNLOCKED_FRAMES = 'grindly_unlocked_frames'

export function getEquippedBadges(): string[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_BADGES) || '[]') } catch { return [] }
}
export function equipBadge(id: string): void {
  const current = getEquippedBadges()
  if (!current.includes(id) && current.length < 3) {
    localStorage.setItem(STORAGE_BADGES, JSON.stringify([...current, id]))
  }
}
export function unequipBadge(id: string): void {
  const current = getEquippedBadges()
  localStorage.setItem(STORAGE_BADGES, JSON.stringify(current.filter(b => b !== id)))
}

export function getEquippedFrame(): string | null {
  return localStorage.getItem(STORAGE_FRAME) || null
}
export function equipFrame(id: string | null): void {
  if (id) localStorage.setItem(STORAGE_FRAME, id)
  else localStorage.removeItem(STORAGE_FRAME)
}

export function getUnlockedBadges(): string[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_UNLOCKED_BADGES) || '[]') } catch { return [] }
}
export function getUnlockedFrames(): string[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_UNLOCKED_FRAMES) || '[]') } catch { return [] }
}

export function getUnlockedAvatarEmojis(): string[] {
  try { return JSON.parse(localStorage.getItem('grindly_unlocked_avatars') || '[]') } catch { return [] }
}

/** Call when an achievement is unlocked — checks if it grants a badge, frame, or avatar */
export function unlockCosmeticsFromAchievement(achievementId: string): void {
  const unlock = ACHIEVEMENT_COSMETIC_UNLOCKS[achievementId]
  if (!unlock) return

  if (unlock.badgeId) {
    const current = getUnlockedBadges()
    if (!current.includes(unlock.badgeId)) {
      localStorage.setItem(STORAGE_UNLOCKED_BADGES, JSON.stringify([...current, unlock.badgeId]))
    }
  }

  if (unlock.frameId) {
    const current = getUnlockedFrames()
    if (!current.includes(unlock.frameId)) {
      localStorage.setItem(STORAGE_UNLOCKED_FRAMES, JSON.stringify([...current, unlock.frameId]))
    }
  }

  if (unlock.avatarEmoji) {
    const current = getUnlockedAvatarEmojis()
    if (!current.includes(unlock.avatarEmoji)) {
      localStorage.setItem('grindly_unlocked_avatars', JSON.stringify([...current, unlock.avatarEmoji]))
    }
  }
}
