import type { LootRarity } from './loot'

export const PET_ROLL_COST = 5_000

// ── Global buff tables (index = pet level 0–10) ───────────────────────────────
/** HP regen added to arena combat stats per level. */
const PET_HP_REGEN = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3] as const
/** Flat ATK added to arena combat stats per level. */
const PET_ATK      = [0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3] as const
/** % bonus to gold earned from arena kills per level. */
const PET_GOLD_PCT = [0, 0, 0, 0, 0, 0, 0, 3, 5, 7, 10] as const

export interface PetDef {
  id: string
  name: string
  emoji: string
  evolvedEmoji: string
  rarity: LootRarity
  /** Skill id this pet buffs, or 'all' for mythic (buffs every skill) */
  skillId: string
  /** Base buff % at level 1, full hunger */
  baseBuffPct: number
}

export interface PetInstance {
  defId: string
  customName: string | null
  level: number           // 1–10
  xp: number              // XP toward next level
  /** Hunger value (0–100) captured at lastFedAt */
  hungerSnapshot: number
  lastFedAt: number       // ms timestamp
  rolledAt: number
  totalFeedings: number
  /** Overrides def.skillId — set at roll time for starter species to track user's top skill */
  assignedSkillId?: string
  // ── Adventures ──────────────────────────────────────────────────────────────
  adventureId?: string | null
  adventureStartedAt?: number | null
  // ── Abilities ───────────────────────────────────────────────────────────────
  scavengeLastUsedAt?: number | null
  motivationBurstActiveUntil?: number | null
  motivationBurstLastUsedAt?: number | null
  // ── Bond milestones ──────────────────────────────────────────────────────────
  bondMilestonesUnlocked?: string[]   // ['day7', 'day30', 'feed50', 'feed100', 'lv10']
  buffBonus?: number                  // permanent +% (0 or 1) from 30-day milestone
  hasEvolvedEmoji?: boolean
  // ── Interaction tracking ──────────────────────────────────────────────────────
  playfulUntil?: number | null        // ms timestamp — playful mood active until this time
  lastInteractedAt?: number | null    // last feed or pet action (for sleeping detection)
  pettedCount?: number                // daily petting count
  pettedDate?: string                 // date string for resetting daily count
}

export type PetMood = 'ecstatic' | 'happy' | 'hungry' | 'starving' | 'exhausted' | 'sleeping' | 'playful'

export function getPetMood(hunger: number): PetMood {
  if (hunger === 0)  return 'exhausted'
  if (hunger < 25)   return 'starving'
  if (hunger < 50)   return 'hungry'
  if (hunger < 75)   return 'happy'
  return 'ecstatic'
}

export const MOOD_EMOJI: Record<PetMood, string> = {
  ecstatic:  '😄',
  happy:     '😊',
  hungry:    '😐',
  starving:  '😢',
  exhausted: '💀',
  sleeping:  '😴',
  playful:   '🥳',
}

export const MOOD_LABEL: Record<PetMood, string> = {
  ecstatic:  'Ecstatic',
  happy:     'Happy',
  hungry:    'Hungry',
  starving:  'Starving',
  exhausted: 'Collapsed',
  sleeping:  'Sleeping',
  playful:   'Playful!',
}

export const MOOD_COLOR: Record<PetMood, string> = {
  ecstatic:  'text-lime-400',
  happy:     'text-lime-300',
  hungry:    'text-amber-400',
  starving:  'text-orange-400',
  exhausted: 'text-gray-500',
  sleeping:  'text-blue-300',
  playful:   'text-yellow-300',
}

/** CSS hex color for a pet mood ring based on synced hunger snapshot (0–100). */
export function getMoodRingColor(hunger: number): string {
  if (hunger === 0)  return '#6b7280' // exhausted — gray-500
  if (hunger < 25)   return '#fb923c' // starving  — orange-400
  if (hunger < 50)   return '#fbbf24' // hungry    — amber-400
  if (hunger < 75)   return '#bef264' // happy     — lime-300
  return '#a3e635'                    // ecstatic  — lime-400
}

// ── Quote pools (mood × species) ─────────────────────────────────────────────

type QuotePool = Record<PetMood, string[]>

const DEFAULT_QUOTES: QuotePool = {
  ecstatic:  ['Lets grind! 🔥', 'I believe in you!', 'Best day ever!', 'So full. So happy.'],
  happy:     ['Ready when you are.', 'All good here.', 'Let\'s go.', 'Focus time?'],
  hungry:    ['A little hungry...', 'Could eat...', 'Hmm.', 'Getting a bit empty.'],
  starving:  ['Please feed me 😢', 'So hungry...', 'My buff is fading...', 'I need food.'],
  exhausted: ['...', 'No energy.', 'Too hungry to buff.', 'Feed me and I\'ll come back.'],
  sleeping:  ['*yawns* Oh, you\'re back...', 'Just resting my eyes...', 'Mmph... five more minutes.', 'Good morning 😴'],
  playful:   ['Let\'s go go go! 🎉', 'That was so good!', 'More! More!', 'Best meal ever! ⭐'],
}

const SPECIES_QUOTES: Partial<Record<string, Partial<QuotePool>>> = {
  pet_cat: {
    ecstatic:  ['I grace you with my presence 🐱', 'Meow = yes.', 'On top of the world.'],
    hungry:    ['Mrrrow... feed me.', 'I don\'t beg. But. Feed me.', 'Energy draining.'],
    starving:  ['I\'m giving you a Look. 😒', 'This is unacceptable.', 'Buff offline. You did this.'],
    sleeping:  ['...you woke me.', 'I was having such a nice dream.', 'Hmm. You\'re here. Fine.'],
    playful:   ['Oh fine, I\'ll admit that was good.', 'Purring intensifies.', '...I\'m pleased.'],
  },
  pet_dog: {
    ecstatic:  ['LET\'S GO! 🐕', 'Best day ever! Woof!', 'Full energy — ready to work!', 'I believe in you!'],
    hungry:    ['Could use a treat...', 'My tail is wagging slower.', 'Getting distracted by hunger.'],
    starving:  ['Please... just a treat 😢', 'Can\'t focus... so hungry.', 'Buff fading. Feed me!'],
    sleeping:  ['YOU\'RE BACK!! I MISSED YOU SO MUCH!! 🐕', 'WHERE WERE YOU?? I WAITED!!', 'FINALLY!! AWAKE NOW!!'],
    playful:   ['BEST THING EVER!! 🎉', 'WOOF WOOF WOOF!!', 'SO HAPPY RIGHT NOW!!!'],
  },
}

export function getPetQuote(defId: string, mood: PetMood): string {
  const species = SPECIES_QUOTES[defId]
  const pool = (species?.[mood]?.length ? species[mood]! : DEFAULT_QUOTES[mood])
  return pool[Math.floor(Math.random() * pool.length)]
}

/** XP required to advance from level L to L+1. Returns Infinity at max level. */
export function xpToNextLevel(level: number): number {
  if (level >= 10) return Infinity
  return level * 10
}

/**
 * Compute current hunger based on elapsed time since last fed.
 * Decays linearly from hungerSnapshot to 0 over 24 hours.
 */
export function computeCurrentHunger(pet: PetInstance): number {
  const elapsed = Math.max(0, Date.now() - pet.lastFedAt)
  const decayRate = 100 / (24 * 60 * 60 * 1000)
  return Math.max(0, Math.min(100, Math.round(pet.hungerSnapshot - elapsed * decayRate)))
}

export function getPetDef(id: string): PetDef | undefined {
  return PETS.find((p) => p.id === id)
}

/**
 * Returns combat and economy bonuses from the active pet based on level.
 * All values scale with hunger (0 when starving or on adventure).
 */
export function getPetGlobalBuffs(pet: PetInstance | null): {
  hpRegen: number   // flat HP regen added to arena stats
  atk: number       // flat ATK added to arena stats
  goldPct: number   // % gold bonus on arena kills
} {
  const none = { hpRegen: 0, atk: 0, goldPct: 0 }
  if (!pet || pet.adventureId) return none
  const hunger = computeCurrentHunger(pet)
  if (hunger === 0) return none

  const hungerFactor = hunger >= 50 ? 1 : hunger / 50
  const lv = Math.max(0, Math.min(10, pet.level)) as 0|1|2|3|4|5|6|7|8|9|10

  return {
    hpRegen: PET_HP_REGEN[lv] * hungerFactor,
    atk:     PET_ATK[lv]      * hungerFactor,
    goldPct: PET_GOLD_PCT[lv] * hungerFactor,
  }
}

/**
 * Full mood computation including playful and sleeping states.
 * Prefer this over getPetMood(hunger) when you have the full PetInstance.
 */
export function computePetMood(pet: PetInstance): PetMood {
  const hunger = computeCurrentHunger(pet)
  if (hunger === 0) return 'exhausted'

  // Playful: within 30 min of a feeding or petting
  if ((pet.playfulUntil ?? 0) > Date.now()) return 'playful'

  // Sleeping: hasn't been interacted with in 8+ hours
  const lastInteracted = pet.lastInteractedAt ?? pet.rolledAt
  const hoursSince = (Date.now() - lastInteracted) / 3_600_000
  if (hoursSince >= 8 && hunger >= 25) return 'sleeping'

  return getPetMood(hunger)
}

/**
 * Returns the animated WebP path when mood is provided (falls back via onError to PNG),
 * or the static PNG when mood is omitted. Returns null for emoji-only species.
 */
export function getPetLevelImage(defId: string, level: number, mood?: PetMood): string | null {
  const lv = Math.max(1, Math.min(10, level))
  // 'ecstatic' maps to 'idle' filename (fully-fed, calm animation)
  const moodFile = mood === 'ecstatic' ? 'idle' : mood
  if (defId === 'pet_cat') return moodFile ? `pets/cat_lv${lv}_${moodFile}.webp` : `pets/cat_lv${lv}.png`
  if (defId === 'pet_dog') return moodFile ? `pets/dog_lv${lv}_${moodFile}.webp` : `pets/dog_lv${lv}.png`
  return null
}

/** Returns the static PNG path for cat/dog (always exists, used as onError fallback). */
export function getPetLevelImagePng(defId: string, level: number): string | null {
  const lv = Math.max(1, Math.min(10, level))
  if (defId === 'pet_cat') return `pets/cat_lv${lv}.png`
  if (defId === 'pet_dog') return `pets/dog_lv${lv}.png`
  return null
}

/** Hunger and pet XP restored by feeding one food item of the given rarity */
export function getFoodFeedValue(rarity: LootRarity): { hungerRestore: number; petXp: number } {
  switch (rarity) {
    case 'rare':      return { hungerRestore: 30, petXp: 2 }
    case 'epic':      return { hungerRestore: 45, petXp: 3 }
    case 'legendary': return { hungerRestore: 60, petXp: 5 }
    case 'mythic':    return { hungerRestore: 80, petXp: 8 }
    default:          return { hungerRestore: 20, petXp: 1 }
  }
}

// ── Adventure system ──────────────────────────────────────────────────────────

export interface AdventureDef {
  id: string
  label: string
  icon: string
  durationMs: number
  minLevel: number
  description: string
  /** Short past-tense phrase: "searched the farm fields" → used in narrative result toast */
  narrativeResult: string
}

export const ADVENTURES: AdventureDef[] = [
  ...(import.meta.env.DEV ? [{ id: 'test', label: 'Test Trip', icon: '🧪', durationMs: 10_000, minLevel: 1, description: '10s · dev only', narrativeResult: 'did a quick test run' } as AdventureDef] : []),
  { id: 'seed_run',  label: 'Seed Run',        icon: '🌱', durationMs: 30 * 60_000,     minLevel: 1, description: '30min · Farm seeds',        narrativeResult: 'searched the farm fields'         },
  { id: 'market',    label: 'Market Forage',   icon: '🏪', durationMs: 2 * 3_600_000,   minLevel: 1, description: '2h · Crafting mats + gold',  narrativeResult: 'dug through the old market'       },
  { id: 'dungeon',   label: 'Dungeon Scout',   icon: '⚔️', durationMs: 4 * 3_600_000,   minLevel: 3, description: '4h · Rare combat drops',     narrativeResult: 'snuck through the arena dungeons' },
  { id: 'library',   label: 'Ancient Library', icon: '📚', durationMs: 6 * 3_600_000,   minLevel: 5, description: '6h · Epic mats + buff food',  narrativeResult: 'studied the ancient scrolls'      },
  { id: 'void_rift', label: 'Void Rift',       icon: '🌌', durationMs: 12 * 3_600_000,  minLevel: 8, description: '12h · Legendary mats',       narrativeResult: 'journeyed beyond the known world'  },
]

export interface AdventureReward {
  materials: Array<{ id: string; qty: number }>
  gold: number
}

const MAT_COMMON    = ['slime_gel', 'goblin_tooth', 'ore_iron', 'monster_fang'] as const
const MAT_RARE      = ['wolf_fang', 'orc_shard', 'magic_essence', 'ancient_scale'] as const
const MAT_EPIC      = ['troll_hide', 'shadow_dust', 'storm_shard', 'void_crystal'] as const
const MAT_LEGENDARY = ['dragon_scale', 'troll_heart', 'dragon_heart'] as const
const MAT_SEEDS     = ['wheat_seed', 'herb_seed', 'apple_seed', 'blossom_seed', 'clover_seed', 'orchid_seed'] as const
const MAT_BUFF_FOOD = ['food_apple_pie', 'food_blossom_stew', 'food_clover_feast'] as const

const _pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]
const _rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

export function rollAdventureReward(adventureId: string): AdventureReward {
  if (adventureId === 'test') {
    return { materials: [{ id: _pick(MAT_COMMON), qty: 1 }], gold: _rand(10, 30) }
  }
  if (adventureId === 'seed_run') {
    const count = 4 + Math.floor(Math.random() * 3) // 4–6 seeds
    const mats: Array<{ id: string; qty: number }> = []
    for (let i = 0; i < count; i++) {
      const id = _pick(MAT_SEEDS)
      const ex = mats.find((m) => m.id === id)
      if (ex) ex.qty++
      else mats.push({ id, qty: 1 })
    }
    return { materials: mats, gold: 0 }
  }
  if (adventureId === 'market') {
    return {
      materials: [
        { id: _pick(MAT_COMMON), qty: _rand(1, 2) },
        { id: _pick(MAT_COMMON), qty: 1 },
        ...(Math.random() < 0.4 ? [{ id: _pick(MAT_RARE), qty: 1 }] : []),
      ],
      gold: _rand(80, 160),
    }
  }
  if (adventureId === 'dungeon') {
    return {
      materials: [
        { id: _pick(MAT_RARE), qty: _rand(1, 2) },
        { id: _pick(MAT_RARE), qty: 1 },
        ...(Math.random() < 0.35 ? [{ id: _pick(MAT_EPIC), qty: 1 }] : [{ id: _pick(MAT_COMMON), qty: _rand(1, 2) }]),
      ],
      gold: _rand(250, 450),
    }
  }
  if (adventureId === 'library') {
    return {
      materials: [
        { id: _pick(MAT_EPIC), qty: 1 },
        { id: _pick(MAT_BUFF_FOOD), qty: 1 },
      ],
      gold: _rand(300, 500),
    }
  }
  // void_rift
  return {
    materials: [
      { id: _pick(MAT_LEGENDARY), qty: 1 },
      { id: _pick(MAT_EPIC), qty: 1 },
    ],
    gold: _rand(600, 1200),
  }
}

/** Roll 1 material for a session drop. Scales with pet level. */
export function rollPetSessionDrop(level: number): string {
  if (level <= 3) return _pick(MAT_COMMON)
  if (level <= 6) return _pick(MAT_RARE)
  if (level <= 9) return _pick(MAT_EPIC)
  // Lv10: 50% epic / 50% legendary
  return Math.random() < 0.5 ? _pick(MAT_EPIC) : _pick(MAT_LEGENDARY)
}

// ── Level abilities ───────────────────────────────────────────────────────────

/** Returns 1.5 during active Motivation Burst, otherwise 1. */
export function getPetMotivationBurstMultiplier(pet: PetInstance): number {
  const until = pet.motivationBurstActiveUntil ?? 0
  return Date.now() < until ? 1.5 : 1
}

// ── Legendary Bond (Lv10 milestone) ──────────────────────────────────────────

export interface LegendaryBondDef {
  icon: string
  description: string
  /** skillId for XP buff ('all' = every skill), null if bonus is not XP-based */
  xpSkillId: string | null
  xpBuff: number        // percentage points added to XP multiplier
  arenaGoldBonus: number  // multiplicative bonus on arena gold (1.0 = none)
}

export const LEGENDARY_BOND: Record<string, LegendaryBondDef> = {
  pet_cat: { icon: '😸', description: '+2% XP to all skills',  xpSkillId: 'all', xpBuff: 2, arenaGoldBonus: 1.00 },
  pet_dog: { icon: '🐩', description: '+10% gold from arena',  xpSkillId: null,  xpBuff: 0, arenaGoldBonus: 1.10 },
}

/** Returns arena gold multiplier from Legendary Bond (Wolf Lv10 ability). */
export function getPetArenaGoldBonus(activePet: PetInstance | null): number {
  if (!activePet || !(activePet.bondMilestonesUnlocked ?? []).includes('lv10')) return 1
  return LEGENDARY_BOND[activePet.defId]?.arenaGoldBonus ?? 1
}

// ── XP multiplier ─────────────────────────────────────────────────────────────

/**
 * Returns skill XP multiplier from the active pet for a given skillId.
 * Returns 1.0 when no pet, wrong skill, pet is dead, or pet is on adventure.
 * Incorporates: species buff, hunger factor, level factor, bond bonus,
 * Legendary Bond XP buff, and Motivation Burst.
 */
export function getPetSkillXpMultiplier(activePet: PetInstance | null, skillId: string): number {
  if (!activePet) return 1
  const def = getPetDef(activePet.defId)
  if (!def) return 1
  // No buff while on adventure
  if (activePet.adventureId) return 1

  const hunger = computeCurrentHunger(activePet)

  // Species base buff (only if skill matches and pet is alive)
  // assignedSkillId overrides def.skillId for starter species
  const effectiveSkillId = activePet.assignedSkillId ?? def.skillId
  let speciesBuff = 0
  if ((effectiveSkillId === 'all' || effectiveSkillId === skillId) && hunger > 0) {
    const hungerFactor = hunger >= 50 ? 1 : hunger / 50
    const levelFactor = 1 + (activePet.level - 1) * 0.1
    speciesBuff = (def.baseBuffPct / 100) * hungerFactor * levelFactor
  }

  // Permanent +1% from 30-day bond milestone
  const bondBonus = (activePet.buffBonus ?? 0) / 100

  // Legendary Bond XP buff at Lv10 milestone
  let legendaryBuff = 0
  if ((activePet.bondMilestonesUnlocked ?? []).includes('lv10')) {
    const bond = LEGENDARY_BOND[activePet.defId]
    if (bond?.xpSkillId && bond.xpBuff > 0) {
      if (bond.xpSkillId === 'all' || bond.xpSkillId === skillId) {
        legendaryBuff = bond.xpBuff / 100
      }
    }
  }

  const baseMultiplier = 1 + speciesBuff + bondBonus + legendaryBuff

  // Motivation Burst multiplier (Lv6 ability: ×1.5 for 20 min)
  const burst = getPetMotivationBurstMultiplier(activePet)
  return burst > 1 ? baseMultiplier * burst : baseMultiplier
}

/** Current buff % as a display string, e.g. "+8.0%". Excludes burst (shown separately). */
export function getPetBuffDisplay(activePet: PetInstance): string {
  const def = getPetDef(activePet.defId)
  if (!def) return '+0%'
  if (activePet.adventureId) return 'on adventure'
  const hunger = computeCurrentHunger(activePet)
  if (hunger === 0) return 'no buff'
  const hungerFactor = hunger >= 50 ? 1 : hunger / 50
  const levelFactor = 1 + (activePet.level - 1) * 0.1
  const bondBonus = activePet.buffBonus ?? 0
  const pct = def.baseBuffPct * hungerFactor * levelFactor + bondBonus
  return `+${pct.toFixed(1)}%`
}

/** Returns the effective skill ID for a pet instance (respects assignedSkillId for starter species). */
export function getEffectiveSkillId(pet: PetInstance): string {
  const def = getPetDef(pet.defId)
  return pet.assignedSkillId ?? def?.skillId ?? 'developer'
}

// ── Page-contextual quotes (fires when player navigates to a page) ────────────

/** Species-specific one-liner when player opens a page. Null = no quote for that page. */
export const PAGE_QUOTES: Partial<Record<string, Partial<Record<string, string>>>> = {
  pet_cat: { farm: 'Soil. On my paws. Rude.', arena: 'I could fight better than these people.', craft: 'Finally, something useful.', cook: 'Something smells good...' },
  pet_dog: { farm: 'SEEDS! CAN WE PLANT? CAN WE??? 🐕', arena: 'LET\'S FIGHT EVERYONE RIGHT NOW', craft: 'I\'LL HELP! SOMEHOW! 🐕', cook: 'FOOD?? IS THAT FOOD??' },
}

export function getPetPageQuote(defId: string, page: string): string | null {
  return PAGE_QUOTES[defId]?.[page] ?? null
}

// ── Milestone celebration quotes ───────────────────────────────────────────────

export const MILESTONE_QUOTES: Partial<Record<string, Partial<Record<string, string>>>> = {
  pet_cat: { day7: 'Seven days. I suppose you\'ve earned my loyalty.', day30: 'Thirty days. You\'re... acceptable.', lv10: 'Maximum cat achieved. You\'re welcome.' },
  pet_dog: { day7: 'SEVEN DAYS TOGETHER YOU\'RE MY FAVORITE PERSON 🐕', day30: 'A WHOLE MONTH!! I LOVE YOU SO MUCH!!', lv10: 'SUPER DOG! ALL FOR YOU! 🐩' },
}

const DEFAULT_MILESTONE_QUOTES: Record<string, string> = {
  day7:   'Seven days together! 🎉',
  day30:  'A whole month! Our bond grows stronger. 🌙',
  feed50: 'You\'ve fed me 50 times. I feel that. 🍗',
  feed100:'A hundred meals together. Legendary. 👑',
  lv10:   'Reached the peak. Legendary bond unlocked. ✨',
}

export function getPetMilestoneQuote(defId: string, milestoneId: string): string {
  return MILESTONE_QUOTES[defId]?.[milestoneId] ?? DEFAULT_MILESTONE_QUOTES[milestoneId] ?? '🎉'
}

// ── Morning greeting quotes (shown when lastFedAt was 8+ hours ago) ───────────

export const MORNING_QUOTES: Partial<Record<string, string>> = {
  pet_cat: 'Oh. You returned. I was fine. Mostly. Feed me.',
  pet_dog: 'YOU\'RE BACK!! I MISSED YOU SO MUCH!! ALSO HUNGRY!! 🐕',
}

export function getPetMorningQuote(defId: string): string {
  return MORNING_QUOTES[defId] ?? 'Good to see you again... so hungry.'
}

// ── Rarity roll ──────────────────────────────────────────────────────────────

const ROLL_WEIGHTS: Record<LootRarity, number> = {
  common: 55,
  rare: 28,
  epic: 12,
  legendary: 4,
  mythic: 1,
}

export function rollRarity(): LootRarity {
  const total = (Object.values(ROLL_WEIGHTS) as number[]).reduce((a, b) => a + b, 0)
  let rand = Math.random() * total
  for (const [rarity, weight] of Object.entries(ROLL_WEIGHTS) as [LootRarity, number][]) {
    rand -= weight
    if (rand <= 0) return rarity
  }
  return 'common'
}

// ── Name pools per species ────────────────────────────────────────────────────

const NAME_POOLS: Record<string, string[]> = {
  pet_cat:      ['Mochi', 'Pixel', 'Jinx', 'Echo', 'Cleo', 'Nova', 'Luna', 'Mira'],
  pet_dog:      ['Buddy', 'Rex', 'Blaze', 'Shadow', 'Frost', 'Chip', 'Valor', 'Finn'],
  pet_fox:      ['Vex', 'Kira', 'Ember', 'Sly', 'Rune', 'Ash', 'Trix', 'Scout'],
  pet_rabbit:   ['Pebble', 'Clover', 'Dash', 'Pip', 'Lumi', 'Swift', 'Binx', 'Sage'],
  pet_capybara: ['Coco', 'Zen', 'Basil', 'Mello', 'Chili', 'Gus', 'Dune', 'Rio'],
  pet_dragon:   ['Ignis', 'Vorn', 'Sable', 'Drak', 'Cinder', 'Pyrex', 'Vael', 'Nox'],
}

export function rollName(petId: string): string {
  const pool = NAME_POOLS[petId] ?? ['Pet']
  return pool[Math.floor(Math.random() * pool.length)]
}

// ── Species definitions ───────────────────────────────────────────────────────

export const PETS: PetDef[] = [
  { id: 'pet_cat', name: 'Cat', emoji: '🐱', evolvedEmoji: '😸', rarity: 'common', skillId: 'all', baseBuffPct: 5 },
  { id: 'pet_dog', name: 'Dog', emoji: '🐕', evolvedEmoji: '🐩', rarity: 'common', skillId: 'all', baseBuffPct: 5 },
]
