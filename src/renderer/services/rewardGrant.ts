import { getUnlockedAvatarEmojis, getUnlockedBadges, getUnlockedFrames, unlockCosmeticsFromAchievement } from '../lib/cosmetics'
import { track } from '../lib/analytics'
import type { AchievementDef } from '../lib/xp'
import type { ProgressionEvent, RewardGrantPayload } from '../lib/progressionContract'
import { SKILL_BOOST_SECONDS } from '../lib/rewardConfig'

const CLAIMED_REWARDS_KEY = 'grindly_claimed_rewards_v2'

function readClaimedRewardKeys(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CLAIMED_REWARDS_KEY) || '[]') as string[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveClaimedRewardKeys(keys: string[]): void {
  try {
    localStorage.setItem(CLAIMED_REWARDS_KEY, JSON.stringify(Array.from(new Set(keys))))
  } catch {
    // ignore storage errors
  }
}

function rewardKey(reward: RewardGrantPayload): string {
  return [
    reward.destination,
    reward.skillId || '',
    reward.cosmeticKey || '',
    reward.amount || 0,
    reward.label,
  ].join(':')
}

export function defaultSkillForAchievement(def: AchievementDef): string {
  if (def.category === 'social') return 'communicator'
  if (def.category === 'special') return 'learner'
  if (def.category === 'streak') return 'researcher'
  if (def.category === 'skill' && def.reward?.type === 'skill_boost') return def.reward.value
  return 'developer'
}

export function mapAchievementToRewardPayloads(def: AchievementDef): RewardGrantPayload[] {
  const payloads: RewardGrantPayload[] = []
  if (def.xpReward > 0) {
    const destination = def.xpDestination ?? 'skill'
    payloads.push({
      destination,
      amount: def.xpReward,
      skillId: destination === 'skill' ? defaultSkillForAchievement(def) : undefined,
      label: `Achievement XP: ${def.name}`,
    })
  }
  if (def.reward) {
    if (def.reward.type === 'skill_boost') {
      payloads.push({
        destination: 'skill',
        skillId: def.reward.value,
        amount: SKILL_BOOST_SECONDS,
        label: def.reward.label,
      })
    } else {
      payloads.push({
        destination: 'cosmetic',
        cosmeticKey: `${def.reward.type}:${def.reward.value}`,
        label: def.reward.label,
      })
    }
  }
  return payloads
}

export async function grantRewardPayloads(
  payloads: RewardGrantPayload[],
  api: Window['electronAPI'] | null,
): Promise<{ granted: RewardGrantPayload[]; skipped: RewardGrantPayload[] }> {
  const claimed = readClaimedRewardKeys()
  const granted: RewardGrantPayload[] = []
  const skipped: RewardGrantPayload[] = []

  for (const payload of payloads) {
    const key = rewardKey(payload)
    if (claimed.includes(key)) {
      skipped.push(payload)
      continue
    }

    if (payload.destination === 'skill' && payload.skillId && payload.amount && payload.amount > 0) {
      if (api?.db?.addSkillXP) {
        await api.db.addSkillXP(payload.skillId, payload.amount)
      } else {
        try {
          const stored = JSON.parse(localStorage.getItem('grindly_skill_xp') || '{}') as Record<string, number>
          stored[payload.skillId] = (stored[payload.skillId] ?? 0) + payload.amount
          localStorage.setItem('grindly_skill_xp', JSON.stringify(stored))
        } catch {
          // ignore corrupted localStorage; reward is still captured in SQLite path above
        }
      }
    }

    claimed.push(key)
    granted.push(payload)
  }

  saveClaimedRewardKeys(claimed)
  if (granted.length > 0) {
    track('reward_claimed', { count: granted.length, types: granted.map((p) => p.destination) })
  }
  return { granted, skipped }
}

export function grantAchievementCosmetics(achievementId: string): {
  unlockedBadges: string[]
  unlockedFrames: string[]
  unlockedAvatars: string[]
} {
  const beforeBadges = new Set(getUnlockedBadges())
  const beforeFrames = new Set(getUnlockedFrames())
  const beforeAvatars = new Set(getUnlockedAvatarEmojis())
  unlockCosmeticsFromAchievement(achievementId)
  const afterBadges = getUnlockedBadges().filter((id) => !beforeBadges.has(id))
  const afterFrames = getUnlockedFrames().filter((id) => !beforeFrames.has(id))
  const afterAvatars = getUnlockedAvatarEmojis().filter((id) => !beforeAvatars.has(id))
  return { unlockedBadges: afterBadges, unlockedFrames: afterFrames, unlockedAvatars: afterAvatars }
}

export function buildRewardEvent(base: Omit<ProgressionEvent, 'id' | 'createdAt'>): ProgressionEvent {
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...base,
  }
}
