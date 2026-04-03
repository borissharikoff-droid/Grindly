import { useEffect, useRef } from 'react'
import { usePetStore } from '../stores/petStore'
import { computeCurrentHunger, getPetDef, ADVENTURES } from '../lib/pets'
import { routeNotification } from '../services/notificationRouter'

/**
 * Fires desktop + in-app notifications for two pet events:
 * 1. Adventure complete — fires once per adventure trip when the timer hits 0
 * 2. Hunger warning — fires once per feed cycle when hunger drops to ≤25%
 *
 * Mount this hook once in App.tsx so it runs regardless of which tab is open.
 */
export function usePetNotifications() {
  const activePet = usePetStore((s) => s.activePet)

  // Track which adventure startedAt we already notified, to fire exactly once
  const notifiedAdventureRef = useRef<number | null>(null)
  // Track which lastFedAt cycle we already warned about hunger
  const notifiedHungerFedAtRef = useRef<number | null>(null)

  useEffect(() => {
    const check = () => {
      const pet = usePetStore.getState().activePet
      if (!pet) return

      const def = getPetDef(pet.defId)
      const petName = pet.customName ?? def?.name ?? 'Your pet'
      const api = window.electronAPI ?? null

      // ── Adventure completion ──────────────────────────────────────────────
      if (pet.adventureId && pet.adventureStartedAt) {
        const advDef = ADVENTURES.find((a) => a.id === pet.adventureId)
        if (advDef) {
          const elapsed = Date.now() - pet.adventureStartedAt
          const done = elapsed >= advDef.durationMs
          if (done && notifiedAdventureRef.current !== pet.adventureStartedAt) {
            notifiedAdventureRef.current = pet.adventureStartedAt
            routeNotification({
              type: 'progression_info',
              icon: advDef.icon,
              title: `${petName} is back!`,
              body: `${advDef.label} complete — go collect your loot.`,
              dedupeKey: `pet-adv-done:${pet.adventureStartedAt}`,
              desktop: true,
            }, api).catch(() => {})
          }
        }
      }

      // ── Hunger warning ────────────────────────────────────────────────────
      if (!pet.adventureId) {
        const hunger = computeCurrentHunger(pet)
        const lastFedAt = pet.lastFedAt ?? 0
        if (
          hunger > 0 &&
          hunger <= 25 &&
          notifiedHungerFedAtRef.current !== lastFedAt
        ) {
          notifiedHungerFedAtRef.current = lastFedAt
          routeNotification({
            type: 'progression_info',
            icon: '🍗',
            title: `${petName} is getting hungry`,
            body: `Feed ${petName} soon — buffs fade at 0%.`,
            dedupeKey: `pet-hungry:${lastFedAt}`,
            desktop: true,
          }, api).catch(() => {})
        }
        // Reset so we can warn again after the next feeding
        if (hunger > 50) {
          notifiedHungerFedAtRef.current = null
        }
      }
    }

    check()
    const id = setInterval(check, 60_000)
    return () => clearInterval(id)
  }, [activePet?.adventureId, activePet?.lastFedAt, activePet?.rolledAt])
}
