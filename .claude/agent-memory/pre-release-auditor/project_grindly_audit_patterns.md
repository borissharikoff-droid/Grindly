---
name: Grindly audit recurring patterns
description: Recurring bug patterns, known risks, and architectural hotspots found during Grindly pre-release audits
type: project
---

Grindly v3.9.0 pre-release audit (2026-03-17) surfaced the following patterns. Use these as first-check targets on future audits.

**Why:** These patterns recur across releases. Knowing them saves time on the next audit.
**How to apply:** In each new audit cycle, grep for these first before doing a full read.

## Zustand Re-render Anti-patterns

### Confirmed in v3.9.0
- `PartyPanel.tsx:28` — `const { createParty, disbandParty, ...} = usePartyStore()` (bare call, no selector)
- `PartyHUD.tsx:9` — `const { acceptInvite, declineInvite } = usePartyStore()` (bare call)
- `PartyMemberCtxMenu.tsx:28` — `const { leaveParty, kickMember, makeLeader } = usePartyStore()` (bare call)

These cause the component to re-render on ANY state change in partyStore (including realtime participant updates every few seconds).

**Fix pattern:** Use `usePartyStore.getState().methodName` inside event handlers, OR select each state value individually with `usePartyStore((s) => s.method)`.

## Cloud Sync Overwrite Risks

### guildService.donateToHall — TOCTOU race
`/c/idly/src/renderer/services/guildService.ts` lines 470-481: read-then-write on `guild_hall_contributions`. Two concurrent calls from different devices can both read the old total and one write will be silently overwritten. Use a Supabase RPC with atomic increment instead.

### applyPartyHpTick — stale phase input
`/c/idly/src/renderer/services/raidService.ts` line 732: `baseDamagePerDay` is fixed to the phase computed at the START of the tick, not recalculated per-day as the raid progresses through phase thresholds. For multi-day offline gaps that cross a phase boundary, players take incorrect (too-low) damage. Low priority for now since raid durations are 2-7 days max.

## Items Consumed Before Server Confirms

### Heal action items (non-refunded on failure)
`/c/idly/src/renderer/components/arena/RaidsTab.tsx` `handleHeal`: items are deleted from inventory BEFORE calling `healTank()`. If the Supabase call fails (e.g., "already healed today"), items are permanently lost. Medium severity.

### Raid food consumed before attackBoss result
`/c/idly/src/renderer/components/arena/RaidFightModal.tsx` line 79-81: food consumed at end of fight simulation, before `attackBoss` call. If app closes between these two events, food is lost without the raid damage being recorded. Low severity (short window).

## Economy / State Integrity

### Weekly bounty claim — rewards before claim flag
`/c/idly/src/renderer/stores/weeklyStore.ts` `claimWeekly`: gold and chest rewards are granted BEFORE the `claimed: true` flag is persisted via `set()`. If app crashes between these, the bounty can be claimed again on restart. Since weeklyStore uses localStorage persist middleware this is a real (if rare) risk.

### submitDailyAttack — no server-side deduplication
`/c/idly/src/renderer/services/raidService.ts` lines 544-549: appends attack to array without checking if today's attack already exists. The UI disables the button, but there is no server-side guard. `submitHealAction` and `submitDefendAction` DO have server-side deduplication checks. Inconsistency.

## Duplicate Imports

### guildStore imports joinGuild twice
`/c/idly/src/renderer/stores/guildStore.ts` lines 6-7: `joinGuild as apiJoinGuild` AND `joinGuild` are both imported from guildService. They reference the same function. The bare `joinGuild` is used in `respondToInvite` (line 187) instead of `get().joinGuild()`, bypassing the store's "already in a guild" guard. Functionally OK because `fetchMyGuild` is called after.

## Navigation Refactor

### BottomNav ALL_TABS matches TabId 1-to-1
All 12 TabId values are represented in ALL_TABS. No missing tabs. DEFAULT_PINNED = ['home', 'skills', 'friends', 'stats'] — farm/craft/cooking land in "More" by default. This is intentional.

### navCustomizationStore uses `persist` — no version migration
No schema version field. If pinnedTabs format changes in a future release, stale localStorage values won't auto-migrate. Low risk now, note for future.

## Test Coverage Added in v3.9.0

New test file: `/c/idly/src/tests/raidStore-edge.test.ts` — 35 tests covering:
- getRaidPhase (boundary conditions, NaN guard)
- rarityMeetsMin (all rarity pairs)
- checkRaidGates (each tier, each gate type)
- PARTY_HP_MAX / PARTY_DAILY_DAMAGE sanity checks
- grantRaidVictoryLoot (seeded random, tier-item mapping)
- RAID_TIER_CONFIGS integrity (boss_hp, contribution_per_win, escalation)
- weeklyStore isoWeekKey (same week, consecutive weeks, format, new year boundary)
