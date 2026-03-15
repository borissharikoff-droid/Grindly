export interface GuildBuff {
  id: string
  icon: string
  label: string
  description: string
  value: number // percent
}

export const GUILD_BUFFS: GuildBuff[] = [
  {
    id: 'xp',
    icon: '⚡',
    label: '+5% Skill XP',
    description: 'All skill XP earned from focus sessions is increased by 5%.',
    value: 5,
  },
  {
    id: 'gold',
    icon: '🪙',
    label: '+5% Arena Gold',
    description: 'Gold earned from mob kills in the Arena is increased by 5%.',
    value: 5,
  },
]

/** Multiplier to apply to skill XP ticks when the player is in a guild. */
export function getGuildXpMultiplier(isInGuild: boolean): number {
  return isInGuild ? 1.05 : 1
}

/** Multiplier to apply to arena mob gold when the player is in a guild. */
export function getGuildGoldMultiplier(isInGuild: boolean): number {
  return isInGuild ? 1.05 : 1
}
