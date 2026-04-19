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

export type FrameStyle =
  | 'pixel' | 'broken' | 'matrix' | 'liquid' | 'glitch' | 'holographic' | 'flame' | 'royal' | 'admin' | 'void' | 'ice' | 'toxic'
  | 'tricolor' | 'tape' | 'creeper' | 'blurple' | 'vice' | 'bolt' | 'nyan' | 'pride'

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
    name: 'Bloodmoon',
    color: '#FF1744',
    gradient: 'linear-gradient(135deg, #1a0000 0%, #7F0000 40%, #C62828 70%, #FF1744 100%)',
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
    name: 'Arcane',
    color: '#818CF8',
    gradient: 'linear-gradient(135deg, #0d0030 0%, #312E81 30%, #6366F1 65%, #A78BFA 100%)',
    rarity: 'Epic',
    style: 'glitch',
    unlockHint: '14-day streak',
    achievementId: 'streak_14',
  },
  {
    id: 'star',
    name: 'Nebula',
    color: '#E879F9',
    gradient: 'linear-gradient(135deg, #0a001a 0%, #4C1D95 25%, #7C3AED 50%, #EC4899 80%, #F0ABFC 100%)',
    rarity: 'Legendary',
    style: 'holographic',
    unlockHint: '3 skills at LVL 25+',
    achievementId: 'polymath',
  },
  {
    id: 'fire',
    name: 'Hellgate',
    color: '#DC2626',
    gradient: 'linear-gradient(135deg, #000000 0%, #450a0a 30%, #7f1d1d 60%, #DC2626 85%, #991b1b 100%)',
    rarity: 'Legendary',
    style: 'flame',
    unlockHint: '30-day streak',
    achievementId: 'streak_30',
  },
  {
    id: 'crown',
    name: 'Lich King',
    color: '#BAE6FD',
    gradient: 'linear-gradient(135deg, #0c1a2e 0%, #1e3a5f 30%, #2563EB 60%, #BAE6FD 85%, #E0F2FE 100%)',
    rarity: 'Legendary',
    style: 'royal',
    unlockHint: 'Complete 50 sessions',
    achievementId: 'fifty_sessions',
  },
  // Epic tier additions
  {
    id: 'void',
    name: 'Void',
    color: '#9B5CF6',
    gradient: 'linear-gradient(135deg, #1a0035 0%, #4C1D95 40%, #7C3AED 70%, #0d0020 100%)',
    rarity: 'Epic',
    style: 'void',
    unlockHint: 'Reach total level 200',
    achievementId: 'total_level_200',
  },
  {
    id: 'ice',
    name: 'Glacier',
    color: '#67E8F9',
    gradient: 'linear-gradient(135deg, #E0F7FA 0%, #67E8F9 30%, #0EA5E9 70%, #BAE6FD 100%)',
    rarity: 'Epic',
    style: 'ice',
    unlockHint: '21-day streak',
    achievementId: 'streak_21',
  },
  {
    id: 'toxic',
    name: 'Toxic',
    color: '#84CC16',
    gradient: 'linear-gradient(135deg, #1a2e00 0%, #4D7C0F 40%, #84CC16 70%, #BEF264 100%)',
    rarity: 'Epic',
    style: 'toxic',
    unlockHint: 'Defeat 50 monsters',
    achievementId: 'arena_kills_50',
  },
  // ── Meme / pop-culture frames (secret unlocks) ──
  {
    id: 'motherland',
    name: 'Motherland',
    color: '#D52B1E',
    gradient: 'linear-gradient(180deg, #FFFFFF 0%, #FFFFFF 33%, #0039A6 33%, #0039A6 66%, #D52B1E 66%, #D52B1E 100%)',
    rarity: 'Rare',
    style: 'tricolor',
    unlockHint: 'За родину — secret frame',
  },
  {
    id: 'tape',
    name: 'Banned Tape',
    color: '#FF9000',
    gradient: 'repeating-linear-gradient(45deg, #000000 0px, #000000 8px, #FF9000 8px, #FF9000 16px)',
    rarity: 'Rare',
    style: 'tape',
    unlockHint: 'Incognito mode — secret frame',
  },
  {
    id: 'creeper',
    name: 'Creeper',
    color: '#4ADE80',
    gradient: 'conic-gradient(from 45deg, #16A34A 0% 25%, #14532D 25% 50%, #16A34A 50% 75%, #14532D 75% 100%)',
    rarity: 'Rare',
    style: 'creeper',
    unlockHint: '"Aw man…" — secret frame',
  },
  {
    id: 'blurple',
    name: 'Blurple',
    color: '#5865F2',
    gradient: 'linear-gradient(135deg, #404EED 0%, #5865F2 40%, #7289DA 70%, #2F3136 100%)',
    rarity: 'Epic',
    style: 'blurple',
    unlockHint: 'Server booster energy — secret frame',
  },
  {
    id: 'vice',
    name: 'Vice',
    color: '#FF006E',
    gradient: 'linear-gradient(135deg, #0A0033 0%, #FF006E 35%, #8338EC 65%, #00F5FF 100%)',
    rarity: 'Epic',
    style: 'vice',
    unlockHint: 'Grind past 2 AM — secret frame',
  },
  {
    id: 'bolt',
    name: 'Bolt',
    color: '#FCD34D',
    gradient: 'linear-gradient(135deg, #000000 0%, #FCD34D 50%, #F59E0B 100%)',
    rarity: 'Epic',
    style: 'bolt',
    unlockHint: 'Gotta grind \'em all — secret frame',
  },
  {
    id: 'nyan',
    name: 'Nyan',
    color: '#FF71CE',
    gradient: 'repeating-linear-gradient(0deg, #FF0000 0px, #FF0000 6px, #FF8800 6px, #FF8800 12px, #FFFF00 12px, #FFFF00 18px, #00FF00 18px, #00FF00 24px, #00BFFF 24px, #00BFFF 30px, #8B5CF6 30px, #8B5CF6 36px)',
    rarity: 'Legendary',
    style: 'nyan',
    unlockHint: 'Pop-tart cat approved — secret frame',
  },
  {
    id: 'pride',
    name: 'Pride',
    color: '#FF8C00',
    gradient: 'conic-gradient(from 0deg, #E40303 0deg, #FF8C00 60deg, #FFED00 120deg, #008026 180deg, #004DFF 240deg, #750787 300deg, #E40303 360deg)',
    rarity: 'Legendary',
    style: 'pride',
    unlockHint: 'Love wins — secret frame',
  },
  // Admin-only
  {
    id: 'admin',
    name: 'Dev',
    color: '#F8FAFC',
    gradient: 'repeating-linear-gradient(45deg, #000000 0px, #000000 6px, #F8FAFC 6px, #F8FAFC 12px)',
    rarity: 'Legendary',
    style: 'admin',
    unlockHint: 'Admin only',
    achievementId: 'is_admin',
  },
]

// ─── LOCKED AVATARS ──────────────────────────────────────
// Some avatars require achievements to unlock.

// Default avatars — free for all players
export const FREE_AVATARS = [
  '🐺', '🦊', '🐱', '🐼', '🐸', '🤖',  // OG tier
  '🐯', '🦝', '🐻', '🦄',               // animals
  '🗿', '😈', '🤡', '🫠',               // meme tier
]

export const LOCKED_AVATARS: { emoji: string; unlockHint: string; achievementId: string }[] = [
  // ── Grind milestones ──
  { emoji: '🚀', unlockHint: 'Complete first session', achievementId: 'first_session' },
  { emoji: '💎', unlockHint: 'Complete 10 sessions', achievementId: 'ten_sessions' },        // Minecraft diamond
  { emoji: '🍄', unlockHint: 'Complete 25 sessions', achievementId: 'twenty_five_sessions' }, // Mario mushroom
  { emoji: '🏆', unlockHint: 'Complete 50 sessions', achievementId: 'fifty_sessions' },
  { emoji: '💀', unlockHint: 'Complete 100 sessions', achievementId: 'hundred_sessions' },   // Dark Souls "You Died"
  // ── Streak ──
  { emoji: '🥷', unlockHint: '5-day streak', achievementId: 'streak_5' },                    // ninja grind
  { emoji: '🫡', unlockHint: '7-day streak', achievementId: 'streak_7' },                    // "reporting for duty"
  { emoji: '🦴', unlockHint: '14-day streak', achievementId: 'streak_14' },                  // skeleton mode
  { emoji: '❄️', unlockHint: '21-day streak', achievementId: 'streak_21' },                  // frozen
  { emoji: '🌟', unlockHint: '30-day streak', achievementId: 'streak_30' },
  // ── Time of day ──
  { emoji: '🦉', unlockHint: 'Night Owl achievement', achievementId: 'night_owl' },
  { emoji: '🐦', unlockHint: 'Early Bird achievement', achievementId: 'early_bird' },
  // ── Combat (game ref) ──
  { emoji: '⚔️', unlockHint: '2h+ coding session', achievementId: 'code_warrior' },          // Stardew/WoW sword
  { emoji: '🦁', unlockHint: '2h+ session', achievementId: 'marathon' },
  { emoji: '👹', unlockHint: 'Defeat first boss', achievementId: 'first_boss_kill' },        // Terraria eye of cthulhu vibe
  { emoji: '🗡️', unlockHint: 'Defeat 50 monsters', achievementId: 'arena_kills_50' },        // Runescape PK
  { emoji: '🐉', unlockHint: 'Reach total level 200', achievementId: 'total_level_200' },    // WoW dragon aspect
  // ── Skill mastery ──
  { emoji: '🧙', unlockHint: 'All skills LVL 10+', achievementId: 'jack_of_all_trades' },   // WoW mage
  { emoji: '🔮', unlockHint: 'All skills LVL 10+ (alt)', achievementId: 'jack_of_all_trades' },
  { emoji: '🎨', unlockHint: 'Designer LVL 50', achievementId: 'skill_designer_50' },
  { emoji: '🧠', unlockHint: 'Developer LVL 99', achievementId: 'skill_developer_99' },      // "Big Brain"
  // ── Social ──
  { emoji: '🤝', unlockHint: 'Add first friend', achievementId: 'first_friend' },
  { emoji: '🌐', unlockHint: 'Have 5 friends', achievementId: 'five_friends' },
  { emoji: '🦋', unlockHint: 'Have 10 friends', achievementId: 'social_butterfly' },
]

export const ADMIN_AVATARS: { emoji: string; label: string }[] = [
  { emoji: '⚙️', label: 'Dev' },
  { emoji: '👾', label: 'Admin' },
  { emoji: '🛸', label: 'UFO' },
]

type AchievementCosmeticUnlock = {
  badgeId?: string
  frameId?: string
  avatarEmoji?: string
}

/**
 * Canonical source of achievement -> cosmetic unlock mapping.
 * Every achievement with a cosmetic reward (avatar, badge, frame) MUST be listed here.
 * An achievement can grant multiple cosmetics (e.g. badge + avatar).
 */
export const ACHIEVEMENT_COSMETIC_UNLOCKS: Record<string, AchievementCosmeticUnlock> = {
  // Grind
  first_session:          { avatarEmoji: '🚀' },
  code_warrior:           { avatarEmoji: '⚔️' },
  marathon:               { avatarEmoji: '🦁' },
  ten_sessions:           { frameId: 'diamond', avatarEmoji: '💎' },
  twenty_five_sessions:   { avatarEmoji: '🍄' },
  fifty_sessions:         { frameId: 'crown', avatarEmoji: '🏆' },
  hundred_sessions:       { avatarEmoji: '💀' },
  // Streak
  streak_2:               { badgeId: 'fire' },
  streak_5:               { avatarEmoji: '🥷' },
  streak_7:               { frameId: 'ember', avatarEmoji: '🫡' },
  streak_14:              { frameId: 'blaze', avatarEmoji: '🦴' },
  streak_21:              { frameId: 'ice', avatarEmoji: '❄️' },
  streak_30:              { frameId: 'fire', avatarEmoji: '🌟' },
  // Special
  night_owl:              { badgeId: 'night_owl', avatarEmoji: '🦉' },
  early_bird:             { badgeId: 'early_bird', avatarEmoji: '🐦' },
  // Social
  first_friend:           { avatarEmoji: '🤝' },
  five_friends:           { avatarEmoji: '🌐' },
  social_butterfly:       { badgeId: 'social', avatarEmoji: '🦋' },
  // Skill
  skill_developer_50:     { frameId: 'code' },
  skill_developer_99:     { avatarEmoji: '🧠' },
  skill_designer_50:      { frameId: 'art', avatarEmoji: '🎨' },
  polymath:               { frameId: 'star' },
  jack_of_all_trades:     { avatarEmoji: '🔮' },
  total_level_200:        { frameId: 'void', avatarEmoji: '🐉' },
  // Arena
  arena_kills_50:         { frameId: 'toxic', avatarEmoji: '🗡️' },
  first_boss_kill:        { avatarEmoji: '👹' },
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
  if (id) {
    localStorage.setItem(STORAGE_FRAME, id)
    window.electronAPI?.db?.setLocalStat?.(STORAGE_FRAME, id).catch(() => {})
  } else {
    localStorage.removeItem(STORAGE_FRAME)
    window.electronAPI?.db?.setLocalStat?.(STORAGE_FRAME, '').catch(() => {})
  }
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

/**
 * Retroactive fix: re-process all unlocked achievements to ensure cosmetics are granted.
 * Fixes cases where achievements were unlocked before their cosmetic mapping existed.
 * Safe to call multiple times — idempotent (only adds missing unlocks).
 */
const COSMETIC_MIGRATION_KEY = 'grindly_cosmetic_migration_v2'
export function ensureCosmeticsForUnlockedAchievements(unlockedAchievementIds: string[]): void {
  const migrated = localStorage.getItem(COSMETIC_MIGRATION_KEY)
  const currentVersion = '2'
  if (migrated === currentVersion && unlockedAchievementIds.length === 0) return
  for (const id of unlockedAchievementIds) {
    unlockCosmeticsFromAchievement(id)
  }
  localStorage.setItem(COSMETIC_MIGRATION_KEY, currentVersion)
}
