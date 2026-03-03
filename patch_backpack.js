const fs = require('fs');
let content = fs.readFileSync('src/renderer/components/inventory/BackpackPanel.tsx', 'utf8');
const hasCRLF = content.includes('\r\n');
if (hasCRLF) content = content.replace(/\r\n/g, '\n');

// 1. Add getItemPerkDescription to import
const old1 = "import { CHEST_DEFS, LOOT_ITEMS, LOOT_SOURCE_LABELS, LOOT_SLOTS, POTION_MAX, getItemPower, type ChestType, type LootSlot } from '../../lib/loot'";
const new1 = "import { CHEST_DEFS, LOOT_ITEMS, LOOT_SOURCE_LABELS, LOOT_SLOTS, POTION_MAX, getItemPower, getItemPerkDescription, type ChestType, type LootSlot } from '../../lib/loot'";
if (!content.includes(old1)) { console.error('Replace 1 not found'); process.exit(1); }
content = content.replace(old1, new1);

// 2. subtitle: item.perkDescription → getItemPerkDescription(item)
const old2 = '        subtitle: item.perkDescription,';
const new2 = '        subtitle: getItemPerkDescription(item),';
if (!content.includes(old2)) { console.error('Replace 2 not found'); process.exit(1); }
content = content.replace(old2, new2);

// 3. {item.perkDescription} in equipped items display
const old3 = '<p className="text-[9px] text-gray-300 leading-snug">{item.perkDescription}</p>';
const new3 = '<p className="text-[9px] text-gray-300 leading-snug">{getItemPerkDescription(item)}</p>';
if (!content.includes(old3)) { console.error('Replace 3 not found'); process.exit(1); }
content = content.replace(old3, new3);

if (hasCRLF) content = content.replace(/\n/g, '\r\n');
fs.writeFileSync('src/renderer/components/inventory/BackpackPanel.tsx', content, 'utf8');
console.log('BackpackPanel.tsx patched successfully');
