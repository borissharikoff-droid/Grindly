const fs = require('fs');
const files = [
  'src/renderer/components/arena/ArenaPage.tsx',
  'src/renderer/components/friends/FriendProfile.tsx',
  'src/renderer/components/inventory/InventoryPage.tsx',
];
for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');
  // Fix trailing brace spacing in imports: getItemPerkDescription} → getItemPerkDescription }
  c = c.replace(/getItemPerkDescription\}/g, 'getItemPerkDescription }');
  fs.writeFileSync(f, c, 'utf8');
  console.log('Fixed', f);
}
