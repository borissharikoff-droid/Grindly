const fs = require('fs');
let content = fs.readFileSync('src/renderer/components/marketplace/MarketplacePage.tsx', 'utf8');
const hasCRLF = content.includes('\r\n');
if (hasCRLF) content = content.replace(/\r\n/g, '\n');

// 1. Add getItemPerkDescription to import
const old1 = "import { LOOT_ITEMS, getRarityTheme, getItemPower, MARKETPLACE_BLOCKED_ITEMS, estimateLootDropRate, type LootRarity } from '../../lib/loot'";
const new1 = "import { LOOT_ITEMS, getRarityTheme, getItemPower, MARKETPLACE_BLOCKED_ITEMS, estimateLootDropRate, getItemPerkDescription, type LootRarity } from '../../lib/loot'";
if (!content.includes(old1)) { console.error('Replace 1 not found'); process.exit(1); }
content = content.replace(old1, new1);

// 2. Listing subtitle
const old2 = "{item?.perkDescription ?? ''}";
const new2 = "{item ? getItemPerkDescription(item) : ''}";
if (!content.includes(old2)) { console.error('Replace 2 not found'); process.exit(1); }
content = content.replace(old2, new2);

// 3. Alert modal perkDescription
const old3 = '<span className="text-gray-500">Effect:</span> {alertItem.perkDescription}';
const new3 = '<span className="text-gray-500">Effect:</span> {getItemPerkDescription(alertItem)}';
if (!content.includes(old3)) { console.error('Replace 3 not found'); process.exit(1); }
content = content.replace(old3, new3);

// 4. Chest confirm perkDescription (lines 934-935)
const old4 = "{item?.perkDescription && (\n                        <p className=\"text-[10px] text-gray-400 text-center mt-1 leading-snug\">{item.perkDescription}</p>";
const new4 = "{item && getItemPerkDescription(item) && (\n                        <p className=\"text-[10px] text-gray-400 text-center mt-1 leading-snug\">{getItemPerkDescription(item)}</p>";
if (!content.includes(old4)) { console.error('Replace 4 not found'); process.exit(1); }
content = content.replace(old4, new4);

if (hasCRLF) content = content.replace(/\n/g, '\r\n');
fs.writeFileSync('src/renderer/components/marketplace/MarketplacePage.tsx', content, 'utf8');
console.log('MarketplacePage.tsx patched successfully');
