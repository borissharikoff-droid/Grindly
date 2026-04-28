import type { CombatStats } from './loot'
import { computePlayerStats, computeWarriorBonuses } from './combat'
import { computeGrindlyBonuses, getGrindlyLevel, getStoredSkillXP, skillLevelFromXP } from './skills'
import { useInventoryStore } from '../stores/inventoryStore'
import { usePetStore } from '../stores/petStore'
import { getPetGlobalBuffs } from './pets'

/**
 * Reads warrior level from the same localStorage blob used everywhere.
 * Duplicated inline across arenaStore; centralized here as single source.
 */
function getWarriorLevel(): number {
  return skillLevelFromXP(getStoredSkillXP()['warrior'] ?? 0)
}

export interface SnapshotOpts {
  /** Extra flat ATK to add on top of warrior/grindly/pet bonuses (e.g. food/plant buff). */
  additionalAtk?: number
  additionalHp?: number
  additionalHpRegen?: number
  additionalDef?: number
}

/**
 * Compose a CombatStats snapshot from the current player state: equipped gear,
 * permanent potion stats, warrior level bonuses, grindly level bonuses, active
 * pet buffs, and any ad-hoc `additional*` bonuses (e.g. plant/food buffs the
 * caller already computed).
 *
 * This centralizes the 4-way duplication that previously existed in
 * arenaStore.ts (startBattle, startDungeon, advanceDungeon, autoRunDungeon).
 *
 * Side-effect free — does not consume items. Callers that need to consume
 * a plant should delete it themselves and pass the resulting buff via
 * `additionalAtk/Hp/HpRegen/Def`.
 */
export function composePlayerSnapshot(opts?: SnapshotOpts): CombatStats {
  const inv = useInventoryStore.getState()
  const warriorBonuses = computeWarriorBonuses(getWarriorLevel())
  const grindlyBonuses = computeGrindlyBonuses(getGrindlyLevel())
  const petBuffs = getPetGlobalBuffs(usePetStore.getState().activePet)

  return computePlayerStats(inv.equippedBySlot, inv.permanentStats, {
    atk:     warriorBonuses.atk     + grindlyBonuses.atk     + petBuffs.atk     + (opts?.additionalAtk ?? 0),
    hp:      warriorBonuses.hp      + grindlyBonuses.hp                         + (opts?.additionalHp ?? 0),
    hpRegen: warriorBonuses.hpRegen + grindlyBonuses.hpRegen + petBuffs.hpRegen + (opts?.additionalHpRegen ?? 0),
    def:     warriorBonuses.def     + grindlyBonuses.def                        + (opts?.additionalDef ?? 0),
  })
}
