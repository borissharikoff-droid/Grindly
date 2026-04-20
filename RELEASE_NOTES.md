## What's new in v4.9.1

### Fixed
- Gold no longer gets lost when two devices earn at once — server-side delta RPC preserves concurrent earnings
- Consumed potions can no longer be restored by stale cloud data (0-key tombstone)
- Crafting can no longer grant phantom items if a job gets cancelled mid-tick
- Arena battles can no longer double-reward if endBattle fires twice
- XP no longer applies against a 0 baseline when SQLite lags at session start
- Dismissed notifications stay dismissed across app restarts (cooldowns persist)
- Settings-customized nav bar survives schema changes (safe migration)
- Marketplace commission deduction now syncs correctly to cloud
- Several UI screens no longer trigger infinite re-render loops

### Improved
- Marketplace seller profiles load in a single query (was N+1)
- Cursor and Claude Code now categorize as AI skill (was Coding)
- +19 regression tests (1289 total)

---
Released: 2026-04-21
