import type { ProgressionEvent } from './progressionContract'

const STORAGE_KEY = 'grindly_progression_history'
const MAX_EVENTS = 100

export function readProgressionHistory(): ProgressionEvent[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as ProgressionEvent[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeProgressionHistory(events: ProgressionEvent[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(0, MAX_EVENTS)))
  } catch {
    // ignore storage failures
  }
}

export function appendProgressionHistory(event: ProgressionEvent): void {
  const events = readProgressionHistory()
  const next = [event, ...events.filter((e) => e.id !== event.id)].slice(0, MAX_EVENTS)
  writeProgressionHistory(next)
}
