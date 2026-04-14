# Contributing to Grindly

Thanks for wanting to contribute! This guide covers the most common patterns.

## Getting started

See the [Development section in README](README.md#development) for setup. The short version:

```bash
git clone https://github.com/borissharikoff-droid/Grindly
cd idly
npm install
npm run electron:dev
```

## Common patterns

### Adding a new skill

Skills live in `src/renderer/lib/skills.ts`. Each skill has an `id`, `name`, `icon`, `color`, and a `category` (the tracker category that feeds it).

**Step 1** — Add the skill definition to the `SKILLS` array:

```typescript
// src/renderer/lib/skills.ts
{ id: 'writer', name: 'Writer', icon: '✍️', color: '#a78bfa', category: 'writing' },
```

**Step 2** — Map the new `ActivityCategory` to the skill in `CATEGORY_TO_SKILL`:

```typescript
const CATEGORY_TO_SKILL: Record<string, string> = {
  // ... existing entries ...
  writing: 'writer',   // add this
}
```

**Step 3** — Add `'writing'` to the `ActivityCategory` union type in `src/main/tracker.ts`:

```typescript
export type ActivityCategory = 'coding' | ... | 'writing' | 'other' | 'idle'
```

**Step 4** — Add process/window title matching in `src/main/tracker.ts` (the `categorizeMultiple` function) so the tracker routes windows to your new category.

**Step 5** — Add a SQLite migration to store the new skill's XP (see below).

> Skills also appear in Supabase profiles. If you're adding a skill that should sync to the social layer, the schema would need updating too — but for a local-only experiment, steps 1-4 are enough to see XP accumulate.

---

### Adding a new item

Items live in `src/renderer/lib/loot.ts`. The `ITEMS` array holds every piece of gear.

**Item fields:**
- `id` — unique string, e.g. `'item_drop_fire_helm'`
- `name` — display name
- `slot` — `'head' | 'body' | 'weapon' | 'legs' | 'ring' | 'accessory' | 'aura' | 'plant' | 'material'`
- `rarity` — `'common' | 'rare' | 'epic' | 'legendary' | 'mythic'`
- `icon` — emoji
- `description` — flavour text
- `perkType` — the primary perk (e.g. `'atk_boost'`, `'hp_boost'`, `'xp_skill_boost'`)
- `perkValue` — numeric value of the primary perk
- `perkDescription` — human-readable perk summary
- `perks` — optional array for multi-perk items

**Example:**

```typescript
{
  id: 'item_drop_fire_helm',
  name: 'Flame Helm',
  slot: 'head',
  rarity: 'rare',
  icon: '🔥',
  description: 'A helm forged in dragon fire.',
  perkType: 'atk_boost',
  perkValue: 5,
  perkDescription: '+5 ATK · +10 HP',
  perks: [
    { perkType: 'atk_boost', perkValue: 5, perkDescription: '+5 ATK' },
    { perkType: 'hp_boost',  perkValue: 10, perkDescription: '+10 HP' },
  ],
},
```

Available `perkType` values: `atk_boost`, `hp_boost`, `hp_regen_boost`, `def_boost`, `xp_skill_boost`, `xp_global_boost`, `chest_drop_boost`, `focus_boost`, `streak_shield`.

> If the item should appear in chest drops, also add it to the chest drop pools in `CHEST_DEFINITIONS` in `loot.ts`.

---

### Adding an arena zone

Arena zones live in `src/renderer/lib/combat.ts`, in the `ARENA_ZONES` array.

**Zone structure:**
```typescript
{
  id: 'zone7',
  name: 'Volcanic Depths',
  icon: '🌋',
  description: 'Molten rock and fire elementals.',
  unlockRequirement: { type: 'warrior_level', value: 50 },
  mobs: [
    { id: 'fire_scout',   name: 'Fire Scout',   icon: '🔥', hp: 1200, atk: 12, def: 4, xpReward: 60, goldMin: 120, goldMax: 200, materialDropId: 'fire_essence', materialDropChance: 0.3 },
    { id: 'fire_warrior', name: 'Fire Warrior', icon: '🔥', hp: 1800, atk: 16, def: 5, xpReward: 90, goldMin: 180, goldMax: 280, materialDropId: 'fire_essence', materialDropChance: 0.4 },
    { id: 'fire_titan',   name: 'Fire Titan',   icon: '🌋', hp: 2800, atk: 20, def: 6, xpReward: 140, goldMin: 250, goldMax: 400, materialDropId: 'fire_essence', materialDropChance: 0.5 },
  ],
  boss: {
    id: 'lava_lord', name: 'Lava Lord', icon: '🌋', hp: 5000, atk: 22, def: 8,
    xpReward: 500, goldMin: 1000, goldMax: 2000,
    materialDropId: 'lava_core', materialDropChance: 1.0,
  },
}
```

The `unlockRequirement.value` is the Warrior skill level required to access the zone.

> New material items (e.g. `fire_essence`, `lava_core`) need to be added to `ITEMS` in `loot.ts` with `slot: 'material'`.

---

### Database migrations (SQLite)

Schema migrations live in `src/main/migrations/index.ts`.

**Rule: append-only.** Never edit or reorder existing migration entries. Always add new ones at the end with the next sequential number.

```typescript
// src/main/migrations/index.ts
{
  version: 18,  // next number after the last one in the file
  up: (db) => {
    db.exec(`ALTER TABLE skill_xp ADD COLUMN prestige_level INTEGER DEFAULT 0`)
  },
},
```

---

## Running tests

```bash
npm test                                          # all tests
npx vitest run src/tests/xp.test.ts               # single file
```

Test files live in `src/tests/`. The test runner is Vitest.

## Opening a PR

Use the PR template. The checklist covers the most common things that break: run tests, test in Electron, check that existing data isn't affected.

If your change touches game data files (`loot.ts`, `combat.ts`, `skills.ts`, `farming.ts`, `crafting.ts`) — the wiki may need updating too. Mention it in your PR so it can be tracked.

## Getting help

Open an [issue](https://github.com/borissharikoff-droid/Grindly/issues) if you're stuck. Describe what you were trying to do and what happened.
