const fs = require('fs');
let content = fs.readFileSync('src/renderer/lib/loot.ts', 'utf8');

// 1. Add LootItemPerk interface before LootItemDef
const old1 = "export type ChestType = 'common_chest' | 'rare_chest' | 'epic_chest' | 'legendary_chest'\n\nexport interface LootItemDef {";
const new1 = "export type ChestType = 'common_chest' | 'rare_chest' | 'epic_chest' | 'legendary_chest'\n\nexport interface LootItemPerk {\n  perkType: LootPerkType\n  perkValue: number | string\n  perkTarget?: string\n  perkDescription: string\n}\n\nexport interface LootItemDef {";
if (!content.includes(old1)) { console.error('Replace 1 not found'); process.exit(1); }
content = content.replace(old1, new1);

// 2. Add perks? field to LootItemDef
const old2 = '  perkDescription: string\n}\n\nexport interface LootPerkRuntime {';
const new2 = '  perkDescription: string\n  perks?: LootItemPerk[]\n}\n\nexport interface LootPerkRuntime {';
if (!content.includes(old2)) { console.error('Replace 2 not found'); process.exit(1); }
content = content.replace(old2, new2);

// 3. Update getEquippedPerkRuntime to use getItemPerks
const old3 = `  for (const item of equippedItems) {
    if (item.perkType === 'xp_skill_boost') {
      const skillKey = item.perkTarget || 'developer'
      out.skillXpMultiplierBySkill[skillKey] = Math.max(
        out.skillXpMultiplierBySkill[skillKey] ?? 1,
        1 + Number(item.perkValue || 0),
      )
    } else if (item.perkType === 'chest_drop_boost') {
      const categoryKey = item.perkTarget || 'coding'
      out.chestDropChanceBonusByCategory[categoryKey] = Math.max(
        out.chestDropChanceBonusByCategory[categoryKey] ?? 0,
        Number(item.perkValue || 0),
      )
    } else if (item.perkType === 'status_title') {
      out.statusTitle = String(item.perkValue || '')
    } else if (item.perkType === 'xp_global_boost') {
      out.globalXpMultiplier = Math.max(out.globalXpMultiplier, 1 + Number(item.perkValue || 0))
    } else if (item.perkType === 'streak_shield') {
      out.streakShield = out.streakShield || Boolean(item.perkValue)
    } else if (item.perkType === 'focus_boost') {
      out.focusBoostMultiplier = Math.max(out.focusBoostMultiplier, 1 + Number(item.perkValue || 0))
    }
    // Combat perks (atk_boost, hp_boost, hp_regen_boost) are summed in getCombatStatsFromEquipped
  }`;
const new3 = `  for (const item of equippedItems) {
    for (const p of getItemPerks(item)) {
      if (p.perkType === 'xp_skill_boost') {
        const skillKey = p.perkTarget || 'developer'
        out.skillXpMultiplierBySkill[skillKey] = Math.max(
          out.skillXpMultiplierBySkill[skillKey] ?? 1,
          1 + Number(p.perkValue || 0),
        )
      } else if (p.perkType === 'chest_drop_boost') {
        const categoryKey = p.perkTarget || 'coding'
        out.chestDropChanceBonusByCategory[categoryKey] = Math.max(
          out.chestDropChanceBonusByCategory[categoryKey] ?? 0,
          Number(p.perkValue || 0),
        )
      } else if (p.perkType === 'status_title') {
        out.statusTitle = String(p.perkValue || '')
      } else if (p.perkType === 'xp_global_boost') {
        out.globalXpMultiplier = Math.max(out.globalXpMultiplier, 1 + Number(p.perkValue || 0))
      } else if (p.perkType === 'streak_shield') {
        out.streakShield = out.streakShield || Boolean(p.perkValue)
      } else if (p.perkType === 'focus_boost') {
        out.focusBoostMultiplier = Math.max(out.focusBoostMultiplier, 1 + Number(p.perkValue || 0))
      }
      // Combat perks (atk_boost, hp_boost, hp_regen_boost) are summed in getCombatStatsFromEquipped
    }
  }`;
if (!content.includes(old3)) { console.error('Replace 3 not found'); process.exit(1); }
content = content.replace(old3, new3);

// 4. Update getCombatStatsFromEquipped to use getItemPerks
const old4 = `  for (const item of equippedItems) {
    if (item.perkType === 'atk_boost') {
      out.atk += Number(item.perkValue || 0)
    } else if (item.perkType === 'hp_boost') {
      out.hp += Number(item.perkValue || 0)
    } else if (item.perkType === 'hp_regen_boost') {
      out.hpRegen += Number(item.perkValue || 0)
    }
  }
  return out
}`;
const new4 = `  for (const item of equippedItems) {
    for (const p of getItemPerks(item)) {
      if (p.perkType === 'atk_boost') {
        out.atk += Number(p.perkValue || 0)
      } else if (p.perkType === 'hp_boost') {
        out.hp += Number(p.perkValue || 0)
      } else if (p.perkType === 'hp_regen_boost') {
        out.hpRegen += Number(p.perkValue || 0)
      }
    }
  }
  return out
}`;
if (!content.includes(old4)) { console.error('Replace 4 not found'); process.exit(1); }
content = content.replace(old4, new4);

// 5. Add getItemPerks and getItemPerkDescription before getEquippedPerkRuntime
const old5 = 'export function getEquippedPerkRuntime(';
const new5 = `/** Returns the perks array for an item, falling back to the legacy single-perk fields. */
export function getItemPerks(item: LootItemDef): LootItemPerk[] {
  if (item.perks?.length) return item.perks
  return [{ perkType: item.perkType, perkValue: item.perkValue, perkTarget: item.perkTarget, perkDescription: item.perkDescription }]
}

/** Human-readable description of all perks on an item, joined with ' · '. */
export function getItemPerkDescription(item: LootItemDef): string {
  return getItemPerks(item).map(p => p.perkDescription).filter(Boolean).join(' \u00b7 ')
}

export function getEquippedPerkRuntime(`;
if (!content.includes(old5)) { console.error('Replace 5 not found'); process.exit(1); }
content = content.replace(old5, new5);

fs.writeFileSync('src/renderer/lib/loot.ts', content, 'utf8');
console.log('loot.ts patched successfully, len=' + content.length);
