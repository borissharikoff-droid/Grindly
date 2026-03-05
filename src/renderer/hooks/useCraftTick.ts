import { useEffect } from 'react'
import { useCraftingStore } from '../stores/craftingStore'
import { useInventoryStore } from '../stores/inventoryStore'
import { grantCrafterXP } from '../lib/farming'

/**
 * Drives the crafting job queue from App-level (runs on all tabs).
 * Ticks every 2 seconds; uses wall-clock anchors so progress is correct
 * even if the app was closed and reopened.
 */
export function useCraftTick() {
  const tick = useCraftingStore((s) => s.tick)
  const addItem = useInventoryStore((s) => s.addItem)

  useEffect(() => {
    function run() {
      tick(Date.now(), (itemId, qty, xpGained) => {
        addItem(itemId, qty)
        if (xpGained > 0) grantCrafterXP(xpGained).catch(() => {})
      })
    }
    // Fast-forward any progress that accrued while the app was closed
    run()
    const id = setInterval(run, 2_000)
    return () => clearInterval(id)
  }, [tick, addItem])
}
