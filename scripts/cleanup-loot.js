'use strict'
const fs = require('fs')
const path = require('path')

const filePath = path.join(__dirname, '../src/renderer/lib/loot.ts')
let src = fs.readFileSync(filePath, 'utf8')

// Normalize CRLF to LF for reliable regex
const crlf = src.includes('\r\n')
if (crlf) src = src.split('\r\n').join('\n')

// ── Step 1: Replace LOOT_ITEMS content (keep potions + plants only) ──────────
const LOOT_START = 'export const LOOT_ITEMS: LootItemDef[] = ['
const LOOT_END = '\nexport const CHEST_DEFS'

const si = src.indexOf(LOOT_START)
const ei = src.indexOf(LOOT_END)
if (si === -1) { console.error('LOOT_ITEMS start not found'); process.exit(1) }
if (ei === -1) { console.error('CHEST_DEFS not found'); process.exit(1) }

const newItems = `export const LOOT_ITEMS: LootItemDef[] = [
  // Potions (consumable)
  {
    id: 'atk_potion',
    name: 'Attack Potion',
    slot: 'consumable',
    rarity: 'mythic',
    icon: '⚗️',
    description: 'A rare brew distilled from arena victories. Permanently increases attack power.',
    perkType: 'atk_boost',
    perkValue: 1,
    perkDescription: '+1 permanent ATK (max 50)',
  },
  {
    id: 'hp_potion',
    name: 'Vitality Potion',
    slot: 'consumable',
    rarity: 'mythic',
    icon: '💊',
    description: 'A rare elixir that permanently reinforces your max HP.',
    perkType: 'hp_boost',
    perkValue: 1,
    perkDescription: '+1 permanent HP (max 50)',
  },
  {
    id: 'regen_potion',
    name: 'Regen Potion',
    slot: 'consumable',
    rarity: 'mythic',
    icon: '💉',
    description: 'A rare formula that permanently boosts your HP regeneration.',
    perkType: 'hp_regen_boost',
    perkValue: 1,
    perkDescription: '+1 permanent HP Regen/s (max 50)',
  },

  // Harvested Plants (from Farm)
  { id: 'wheat',        name: 'Wheat',        slot: 'plant', rarity: 'common',    icon: '🌾', description: 'Golden wheat harvested from your farm.',          perkType: 'harvested_plant', perkValue: 0, perkDescription: 'Farm harvest. Sell on the Marketplace.' },
  { id: 'herbs',        name: 'Herbs',        slot: 'plant', rarity: 'common',    icon: '🌿', description: 'Fresh herbs harvested from your farm.',           perkType: 'harvested_plant', perkValue: 0, perkDescription: 'Farm harvest. Sell on the Marketplace.' },
  { id: 'apples',       name: 'Apples',       slot: 'plant', rarity: 'rare',      icon: '🍎', description: 'Crisp apples grown with care.',                  perkType: 'harvested_plant', perkValue: 0, perkDescription: 'Farm harvest. Sell on the Marketplace.' },
  { id: 'blossoms',     name: 'Blossoms',     slot: 'plant', rarity: 'rare',      icon: '🌸', description: 'Delicate blossoms from your garden.',            perkType: 'harvested_plant', perkValue: 0, perkDescription: 'Farm harvest. Sell on the Marketplace.' },
  { id: 'clovers',      name: 'Clovers',      slot: 'plant', rarity: 'epic',      icon: '🍀', description: 'Lucky four-leaf clovers, rare and prized.',      perkType: 'harvested_plant', perkValue: 0, perkDescription: 'Farm harvest. Sell on the Marketplace.' },
  { id: 'orchids',      name: 'Orchids',      slot: 'plant', rarity: 'epic',      icon: '🌺', description: 'Exotic orchids requiring patience to grow.',     perkType: 'harvested_plant', perkValue: 0, perkDescription: 'Farm harvest. Sell on the Marketplace.' },
  { id: 'star_bloom',   name: 'Star Bloom',   slot: 'plant', rarity: 'legendary', icon: '🌟', description: 'A radiant bloom said to hold cosmic energy.',    perkType: 'harvested_plant', perkValue: 0, perkDescription: 'Farm harvest. Sell on the Marketplace.' },
  { id: 'crystal_root', name: 'Crystal Root', slot: 'plant', rarity: 'legendary', icon: '💎', description: 'A crystalline root pulsing with energy.',        perkType: 'harvested_plant', perkValue: 0, perkDescription: 'Farm harvest. Sell on the Marketplace.' },
  { id: 'void_blossom', name: 'Void Blossom', slot: 'plant', rarity: 'mythic',   icon: '🔮', description: 'A flower from beyond — grown from a Void Spore.', perkType: 'harvested_plant', perkValue: 0, perkDescription: 'Farm harvest. Sell on the Marketplace.' },
]`

src = src.slice(0, si) + newItems + src.slice(ei)

// ── Step 2: Update CHEST_DEFS itemWeights ─────────────────────────────────────
// Replace itemWeights arrays only (don't touch other chest fields)
// We use a helper that replaces each chest's itemWeights block

function replaceChestWeights(source, chestId, newWeights) {
  // Match: chestId + anything + itemWeights: [ ... ],
  const pattern = new RegExp(
    '(' + chestId + ': \\{[\\s\\S]*?itemWeights: \\[)[\\s\\S]*?(\\],)',
    'g'
  )
  return source.replace(pattern, (match, open, close) => {
    return open + '\n' + newWeights + '    ' + close
  })
}

src = replaceChestWeights(src, 'common_chest',    '')
src = replaceChestWeights(src, 'rare_chest',      '')
src = replaceChestWeights(src, 'epic_chest',
  `      { itemId: 'atk_potion', weight: 1 },\n` +
  `      { itemId: 'hp_potion', weight: 1 },\n` +
  `      { itemId: 'regen_potion', weight: 1 },\n`
)
src = replaceChestWeights(src, 'legendary_chest',
  `      { itemId: 'atk_potion', weight: 3 },\n` +
  `      { itemId: 'hp_potion', weight: 3 },\n` +
  `      { itemId: 'regen_potion', weight: 3 },\n`
)

// Restore CRLF if original had it
if (crlf) src = src.split('\n').join('\r\n')

fs.writeFileSync(filePath, src, 'utf8')

const ids = src.match(/id: '[\w_]+'/g) || []
console.log('Done. Items found:', ids.filter(x => !x.includes('chest')).join(', '))
