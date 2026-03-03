const fs = require('fs');

function patchFile(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf8');
  const hasCRLF = content.includes('\r\n');
  if (hasCRLF) content = content.replace(/\r\n/g, '\n');
  let changed = false;
  for (const [old, newStr] of replacements) {
    if (!content.includes(old)) { console.error(`Not found in ${filePath}:`, old.slice(0, 60)); continue; }
    content = content.replace(old, newStr);
    changed = true;
  }
  if (hasCRLF) content = content.replace(/\n/g, '\r\n');
  if (changed) fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Patched ${filePath}`);
}

// ChestOpenModal.tsx
patchFile('src/renderer/components/animations/ChestOpenModal.tsx', [
  [
    "import {",
    "import { getItemPerkDescription,"  // we'll patch import line separately
  ]
]);
// Actually let me do a proper patch for each file

// ChestOpenModal.tsx - just add import and replace
let f = fs.readFileSync('src/renderer/components/animations/ChestOpenModal.tsx', 'utf8');
const hasCRLF1 = f.includes('\r\n');
if (hasCRLF1) f = f.replace(/\r\n/g, '\n');
// Find loot import
if (f.includes("from '../../lib/loot'") || f.includes("from '../lib/loot'") || f.includes("from '../../lib/loot'")) {
  // Add getItemPerkDescription to existing import if not already there
  f = f.replace(/(import\s*\{[^}]*)(}\s*from\s*['"][^'"]*lib\/loot['"])/, (match, p1, p2) => {
    if (p1.includes('getItemPerkDescription')) return match;
    return p1.trimEnd() + ', getItemPerkDescription' + p2;
  });
}
// Replace perkDescription in JSX
f = f.replace(/\{item\.perkDescription\}/g, '{getItemPerkDescription(item)}');
if (hasCRLF1) f = f.replace(/\n/g, '\r\n');
fs.writeFileSync('src/renderer/components/animations/ChestOpenModal.tsx', f, 'utf8');
console.log('ChestOpenModal.tsx patched');

// ArenaPage.tsx
f = fs.readFileSync('src/renderer/components/arena/ArenaPage.tsx', 'utf8');
const hasCRLF2 = f.includes('\r\n');
if (hasCRLF2) f = f.replace(/\r\n/g, '\n');
f = f.replace(/(import\s*\{[^}]*)(}\s*from\s*['"][^'"]*lib\/loot['"])/, (match, p1, p2) => {
  if (p1.includes('getItemPerkDescription')) return match;
  return p1.trimEnd() + ', getItemPerkDescription' + p2;
});
f = f.replace(/\{item\.perkDescription\}/g, '{getItemPerkDescription(item)}');
if (hasCRLF2) f = f.replace(/\n/g, '\r\n');
fs.writeFileSync('src/renderer/components/arena/ArenaPage.tsx', f, 'utf8');
console.log('ArenaPage.tsx patched');

// FriendProfile.tsx
f = fs.readFileSync('src/renderer/components/friends/FriendProfile.tsx', 'utf8');
const hasCRLF3 = f.includes('\r\n');
if (hasCRLF3) f = f.replace(/\r\n/g, '\n');
f = f.replace(/(import\s*\{[^}]*)(}\s*from\s*['"][^'"]*lib\/loot['"])/, (match, p1, p2) => {
  if (p1.includes('getItemPerkDescription')) return match;
  return p1.trimEnd() + ', getItemPerkDescription' + p2;
});
f = f.replace(/\{item\.perkDescription\}/g, '{getItemPerkDescription(item)}');
if (hasCRLF3) f = f.replace(/\n/g, '\r\n');
fs.writeFileSync('src/renderer/components/friends/FriendProfile.tsx', f, 'utf8');
console.log('FriendProfile.tsx patched');

// InventoryPage.tsx
f = fs.readFileSync('src/renderer/components/inventory/InventoryPage.tsx', 'utf8');
const hasCRLF4 = f.includes('\r\n');
if (hasCRLF4) f = f.replace(/\r\n/g, '\n');
f = f.replace(/(import\s*\{[^}]*)(}\s*from\s*['"][^'"]*lib\/loot['"])/, (match, p1, p2) => {
  if (p1.includes('getItemPerkDescription')) return match;
  return p1.trimEnd() + ', getItemPerkDescription' + p2;
});
// subtitle: item.perkDescription
f = f.replace(/subtitle:\s*item\.perkDescription,/g, 'subtitle: getItemPerkDescription(item),');
// description: item.perkDescription
f = f.replace(/description:\s*item\.perkDescription,/g, 'description: getItemPerkDescription(item),');
// JSX {item.perkDescription} and {inspectItem.perkDescription}
f = f.replace(/\{item\.perkDescription\}/g, '{getItemPerkDescription(item)}');
f = f.replace(/\{inspectItem\.perkDescription\}/g, '{getItemPerkDescription(inspectItem)}');
// lootItem.perkDescription
f = f.replace(/lootItem\.perkDescription/g, 'getItemPerkDescription(lootItem)');
if (hasCRLF4) f = f.replace(/\n/g, '\r\n');
fs.writeFileSync('src/renderer/components/inventory/InventoryPage.tsx', f, 'utf8');
console.log('InventoryPage.tsx patched');

console.log('All UI files patched');
