const fs = require('fs');
let content = fs.readFileSync('src/renderer/lib/itemConfig.ts', 'utf8');
// Normalize to LF for patching
const hasCRLF = content.includes('\r\n');
if (hasCRLF) content = content.replace(/\r\n/g, '\n');

// 1. Update import
const old1 = "import type { LootItemDef, LootRarity, LootSlot } from './loot'";
const new1 = "import { CHEST_DEFS, type LootItemDef, type LootItemPerk, type LootRarity, type LootSlot, type ChestType } from './loot'";
if (!content.includes(old1)) { console.error('Replace 1 not found'); process.exit(1); }
content = content.replace(old1, new1);

// 2. Add perks to ItemOverride
const old2 = '  perkType?: string\n  perkValue?: number | string\n  perkTarget?: string\n  perkDescription?: string\n}';
const new2 = '  perkType?: string\n  perkValue?: number | string\n  perkTarget?: string\n  perkDescription?: string\n  perks?: LootItemPerk[]\n}';
if (!content.includes(old2)) { console.error('Replace 2 not found'); process.exit(1); }
content = content.replace(old2, new2);

// 3. Add chestOverrides to AdminConfig
const old3 = '  chestWeightOverrides?: Record<string, ChestWeightEntry[]>\n}';
const new3 = '  chestWeightOverrides?: Record<string, ChestWeightEntry[]>\n  chestOverrides?: Record<string, { icon?: string; image?: string }>\n}';
if (!content.includes(old3)) { console.error('Replace 3 not found'); process.exit(1); }
content = content.replace(old3, new3);

// 4. Add chest patching in applyAdminConfig after boss patching block
const old4 = '  // Patch existing bosses\n  for (const [id, overrides] of Object.entries(cfg.bossOverrides ?? {})) {\n    const boss = bosses.find((x) => x.id === id)\n    if (boss) {\n      if (overrides.name !== undefined) boss.name = overrides.name\n      if (overrides.icon !== undefined) boss.icon = overrides.icon\n      if (overrides.image !== undefined) boss.image = overrides.image\n      if (overrides.hp !== undefined) boss.hp = overrides.hp\n      if (overrides.atk !== undefined) boss.atk = overrides.atk\n      if (overrides.rewards) Object.assign(boss.rewards, overrides.rewards)\n    }\n  }\n}';
const new4 = '  // Patch existing bosses\n  for (const [id, overrides] of Object.entries(cfg.bossOverrides ?? {})) {\n    const boss = bosses.find((x) => x.id === id)\n    if (boss) {\n      if (overrides.name !== undefined) boss.name = overrides.name\n      if (overrides.icon !== undefined) boss.icon = overrides.icon\n      if (overrides.image !== undefined) boss.image = overrides.image\n      if (overrides.hp !== undefined) boss.hp = overrides.hp\n      if (overrides.atk !== undefined) boss.atk = overrides.atk\n      if (overrides.rewards) Object.assign(boss.rewards, overrides.rewards)\n    }\n  }\n\n  // Patch chest icon/image\n  for (const [id, ov] of Object.entries(cfg.chestOverrides ?? {})) {\n    const chest = CHEST_DEFS[id as ChestType]\n    if (chest) {\n      if (ov.icon) chest.icon = ov.icon\n      if (ov.image) chest.image = ov.image\n    }\n  }\n}';
if (!content.includes(old4)) { console.error('Replace 4 not found'); process.exit(1); }
content = content.replace(old4, new4);

// Restore CRLF if original had it
if (hasCRLF) content = content.replace(/\n/g, '\r\n');
fs.writeFileSync('src/renderer/lib/itemConfig.ts', content, 'utf8');
console.log('itemConfig.ts patched successfully');
