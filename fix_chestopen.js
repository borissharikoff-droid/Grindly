const fs = require('fs');
let content = fs.readFileSync('src/renderer/components/animations/ChestOpenModal.tsx', 'utf8');
const hasCRLF = content.includes('\r\n');
if (hasCRLF) content = content.replace(/\r\n/g, '\n');

// Fix: remove wrongly-added import from framer-motion and fix loot import
content = content.replace(
  "import { getItemPerkDescription, AnimatePresence, motion } from 'framer-motion'",
  "import { AnimatePresence, motion } from 'framer-motion'"
);
// Fix duplicate in loot import
content = content.replace(
  "import { CHEST_DEFS, getRarityTheme, getItemPerkDescription} from '../../lib/loot'",
  "import { CHEST_DEFS, getRarityTheme, getItemPerkDescription } from '../../lib/loot'"
);

if (hasCRLF) content = content.replace(/\n/g, '\r\n');
fs.writeFileSync('src/renderer/components/animations/ChestOpenModal.tsx', content, 'utf8');
console.log('Fixed ChestOpenModal.tsx');
