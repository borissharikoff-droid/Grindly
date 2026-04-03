import { useMemo } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { SKILLS, skillLevelFromXP, skillXPProgress } from '../../lib/skills'
import { usePetStore } from '../../stores/petStore'
import { computeCurrentHunger, getEffectiveSkillId, getPetDef } from '../../lib/pets'

/**
 * Shows a compact progress row for each skill the user picked during onboarding.
 * Reads grindly_primary_skills from localStorage (set during onboarding).
 * Only renders if the user actually picked skills.
 */
export function PrimarySkillsWidget() {
  const sessionSkillXP = useSessionStore((s) => s.sessionSkillXP)
  const status = useSessionStore((s) => s.status)
  const activePet = usePetStore((s) => s.activePet)

  const primaryIds: string[] = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('grindly_primary_skills') ?? '[]') } catch { return [] }
  }, [])

  // Compute pet XP buff once for all skills
  const petXpBuff = useMemo(() => {
    if (!activePet || activePet.adventureId) return null
    const hunger = computeCurrentHunger(activePet)
    if (hunger === 0) return null
    const def = getPetDef(activePet.defId)
    const hungerFactor = hunger >= 50 ? 1 : hunger / 50
    const levelFactor = 1 + (activePet.level - 1) * 0.1
    const bondBonus = activePet.buffBonus ?? 0
    const xpPct = (def?.baseBuffPct ?? 5) * hungerFactor * levelFactor + bondBonus
    const effectiveSkillId = getEffectiveSkillId(activePet)
    const petName = activePet.customName ?? def?.name ?? 'pet'
    return { xpPct, effectiveSkillId, petName }
  }, [activePet])

  const storedXP: Record<string, number> = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('grindly_skill_xp') ?? '{}') } catch { return {} }
  }, [])

  if (primaryIds.length === 0) return null

  const skills = SKILLS.filter((s) => primaryIds.includes(s.id))

  return (
    <div className="rounded-card border border-white/8 bg-surface-1 px-3 py-2.5 space-y-2">
      <p className="text-micro font-semibold text-gray-500 uppercase tracking-wider">My Skills</p>
      {skills.map((skill) => {
        const base = storedXP[skill.id] ?? 0
        const session = status === 'running' ? (sessionSkillXP[skill.id] ?? 0) : 0
        const totalXP = base + session
        const level = skillLevelFromXP(totalXP)
        const { current, needed } = skillXPProgress(totalXP)
        const pct = needed > 0 ? Math.min(100, (current / needed) * 100) : 0

        const buffThisSkill = petXpBuff && (
          petXpBuff.effectiveSkillId === 'all' || petXpBuff.effectiveSkillId === skill.id
        )

        return (
          <div key={skill.id} className="flex items-center gap-2">
            <span className="text-sm leading-none w-5 text-center">{skill.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-caption text-gray-300 font-medium">{skill.name}</span>
                <div className="flex items-center gap-1.5">
                  {buffThisSkill && (
                    <span className="text-[9px] font-mono text-lime-500/80 tabular-nums">
                      🐾 +{petXpBuff!.xpPct.toFixed(1)}%
                    </span>
                  )}
                  <span className="text-micro text-gray-500 tabular-nums">Lv {level}</span>
                </div>
              </div>
              <div className="h-1 rounded-full bg-white/8 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: skill.color }}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
