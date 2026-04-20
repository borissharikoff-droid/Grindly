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

## Wiki Sync Debt (found 2026-04-06)

The wiki is systematically NOT auto-synced from source. Three categories of persistent drift found:

1. **crafting.html XP values** are all wrong by 3–11× — likely last synced against an older XP table before xpPerItem values were scaled up. Every single recipe in the table needs to be regenerated from CRAFT_RECIPES in crafting.ts. Don't trust any crafting wiki value without cross-checking.

2. **crafting.html craft times** are all wrong by ~60× — wiki shows human-friendly "1h 30m" strings but is computing them by treating seconds as minutes (e.g. secPerItem:600 → wiki says "10 hours" not "10 minutes"). The display formatter used during wiki gen was bugged.

3. **crafting.html recipe ingredients** — at least 3 recipes have completely wrong ingredients: Compost (should be Wheat×2+Herbs×1 not ×5+×3), Dungeon Pass (should be SlimeGel×3+Apples×2 not Wheat+Herbs), Lich Sigil Ring (should be DragonScale×4+DragonHeart×1 not ShadowDust+LichCrystal), Storm Titan Blade third ingredient (VoidBlossom×1 not ShadowDust×4).

4. **arena.html** has a phantom gate item: Zone 2 Goblin Outpost wiki shows "Iron Helm" as a gate item but combat.ts has no gateItems on zone2. Also Zone 1 boss drop is wrong (SlimeGel×3 not IronOre×2).

5. **loot.html** shows Lich gear as Legendary rarity but crafting.ts defines them as Mythic.

**Root cause:** Wiki pages appear to have been hand-authored, not generated from source. Future releases must diff the wiki against source before shipping.

## v4.9.0 Audit Findings (2026-04-20)

### Fixed Since v3.9.0
- `donateToHall` — now uses `increment_hall_contribution` RPC (atomic). TOCTOU race resolved.
- `weeklyStore.claimWeekly` — claim flag is now set BEFORE gold is granted. Reward-before-claim pattern fixed.
- `RaidsTab.handleHeal` — items now consumed AFTER server confirms. Items-before-confirm pattern fixed.
- `PartyPanel`, `PartyHUD`, `PartyMemberCtxMenu` — all bare `usePartyStore()` calls replaced with individual selectors.
- `submitDailyAttack` — server-side dedup check added (`already attacked today`). Inconsistency with heal/defend resolved.

### Active Issues in v4.9.0

#### Re-render Anti-patterns (bare store destructures)
- `FocusModeDock.tsx:26` — `const { focusModeActive, focusModeEndsAt, elapsedSeconds, status, start, enableFocusMode, disableFocusMode } = useSessionStore()` — subscribes to ALL sessionStore changes including every elapsed tick (every 1s)
- `SessionControls.tsx:8` — `const { status, elapsedSeconds, start, stop, pause, resume } = useSessionStore()` — same pattern, ticks every second
- `LevelUpModal.tsx:9` — `const { pendingLevelUp, dismissLevelUp } = useSessionStore()` — bare call, re-renders on every session tick
- `SkillLevelUpModal.tsx:15` — `const { pendingSkillLevelUpSkill, dismissSkillLevelUp, currentActivity, progressionEvents } = useSessionStore()` — bare call
- `SessionComplete.tsx:215` — bare `useSessionStore()` destructure in component body
- `CraftPage.tsx:761` — `const { craftXp, activeJob, queue, recipeMastery, hydrate, startCraft, cancelJob } = useCraftingStore()` — bare call
- `CraftPage.tsx:765` — `const { initiateSession } = usePartyCraftStore()` — bare call
- `PartyHUD.tsx:73` — `const { subscribeRealtime, unsubscribeRealtime, fetchSession } = usePartyCraftStore()` — bare call

#### Cloud Sync / Gold Overwrite
- `goldStore.syncFromSupabase` — unconditionally `set({ gold: cloudGold })` without comparing to local. Called on MarketplacePage mount AND after every buy. If a buy credits gold locally and then syncFromSupabase fires before the Supabase RPC `sync_gold` completes, the stale cloud value overwrites the newly-granted gold. Window is ~500ms (debounce).

#### Tracker / Test Failures
- `tracker.test.ts` — 2 tests failing: Cursor and "Claude Code in browser" both expected to return 'coding' but tracker now returns 'ai'. Tests were written before the 'ai' category was added. Tests need updating to match intentional behavior (or behavior needs revisiting if Cursor should be 'coding').

#### Migration Gap
- Migration `009` is documented as a no-op comment (no schema change). This is fine and intentional per CLAUDE.md, but means the sequence jumps to `010` visually missing. No action needed.

## v4.9.0 Wave-2 Deep Audit Findings (2026-04-20)

### Critical
- `user_skills` table: RLS is entirely DISABLED (`relrowsecurity=false`). Any authenticated user can read or write ANY user's skill XP directly. All skill data is exposed and mutable without going through the `sync_skills` RPC. Needs `ALTER TABLE user_skills ENABLE ROW LEVEL SECURITY` + per-user policies.

### High
- `arenaStore.endBattle` line 510-518: mob victory path calls `set({ activeBattle: null })` a second time AFTER the initial idempotency clear at line 425. This second `set` can race with `advanceDungeon`, which guards `if (activeBattle) return`. If JS event loop interleaves between the two `set()` calls, `advanceDungeon` can fire with `activeBattle !== null` from stale closure.
- `sessionStore.start` lines 511-527: `skillXPAtStart` is loaded async via `Promise.resolve().then()`. The `tick()` function runs immediately (1s intervals). For the first ~1 tick, `skillXPAtStart` is `{}`, so `baseXP=0` for all skills. Any level-up threshold crossed in the first second will compare against 0, potentially triggering a false level-up notification. Race: `tick` fires before async IPC returns.
- `inventoryStore.syncItemsFromCloud` (line 476): overwrites local item quantities unconditionally with cloud values, including cases where local has been consumed (quantity=0). `deleteItem` preserves 0-keys specifically to prevent `mergeFromCloud` from restoring them, but `syncItemsFromCloud` (called after marketplace ops) skips this guard — it removes the 0-key when `quantity <= 0` (line 481), which would then allow a subsequent `mergeFromCloud` to restore the item from cloud. Double-trigger: sell item → syncItemsFromCloud removes 0-key → mergeFromCloud on next sync restores it.
- `craftingStore.tick` vs `startCraft` are not atomic: `tick()` is called externally every 2s and reads/writes `activeJob`. If `startCraft` is called concurrently (React event + tick in same JS microtask), both can read stale `activeJob === null` and create duplicate active jobs. No mutex/lock.

### Medium
- `notificationRouter.ts` `lastSentByKey` is a module-level Map — it survives React Fast Refresh but is RESET on full app restart. After reload, all cooldowns are gone; a rehydrating store that fires multiple notifications on mount (e.g., achievement storm) will blast all of them to the desktop simultaneously.
- `arenaStore.autoRunDungeon` accumulates `totalGold` for mob kills but the 12% inflation tax is applied only at the END of all runs (line 925). If a boss kill opens chests whose `goldDropped` is added to `totalGold` (line 870), that gold is also taxed. But gold ALREADY credited to wallet for mob kills (line 832) is NOT taxed again — the tax only subtracts from `totalGold` which is the display value. The wallet already received the raw gold. The final `addGold(totalGold)` double-credits: mob gold was already added inside the loop AND added again at the end.
- `sync_gold` RPC is a hard set (`UPDATE profiles SET gold = v_capped`), not a delta. If two devices sync gold simultaneously, last-write-wins at the profile row level. No merge or audit trail. A fast offline play session that earns gold and syncs after a slower online session's sync will silently discard the online session's gold changes.
- `partyCraftStore.subscribeRealtime` topic check uses string equality on `_craftChannel.topic` (line 52). Supabase channel topic format is `realtime:party_craft_${partyId}`. If the channel is still subscribing when a second call comes in with the same partyId, it won't be deduplicated because `.topic` may differ from the formatted string before subscription completes.

### Low
- `tracker.ts` `DETECTOR_SCRIPT` embeds a C# inline script that is written to `%APPDATA%\Grindly\grindly-window-detector.ps1` on fallback mode. The script is not signed. While the content is hardcoded and not user-controlled, if the userData directory has weak permissions, a local privilege escalation could replace the script between write and execution. Low risk in practice (Electron apps already have full user permissions).
- Migration sequence: `009` is intentionally a no-op (comment only in array). The next actual migration will be `010`, creating an apparent gap. This is fine per CLAUDE.md but worth noting for new contributors.

### Supabase RLS Summary
- `user_skills`: RLS OFF — critical
- `marketplace_listings` UPDATE policy allows seller to UPDATE status to 'sold' directly (bypassing RPC `buy_listing` atomic lock). A seller could mark their own listing sold without a buyer paying. The `buy_listing` RPC correctly uses `FOR UPDATE` lock, but the table-level UPDATE policy doesn't enforce RPC-only writes.
- `user_inventory` SELECT: "Authenticated users can view any inventory" policy (`qual=true`) — any logged-in user can query another user's full inventory. Intended for marketplace browsing but overly broad.
- `session_summaries` SELECT: two overlapping policies (one `qual=true`, one friend-only). The `true` policy wins, making all session summaries public to any authenticated user.

## Test Coverage Added in v3.9.0

New test file: `/c/idly/src/tests/raidStore-edge.test.ts` — 35 tests covering:
- getRaidPhase (boundary conditions, NaN guard)
- rarityMeetsMin (all rarity pairs)
- checkRaidGates (each tier, each gate type)
- PARTY_HP_MAX / PARTY_DAILY_DAMAGE sanity checks
- grantRaidVictoryLoot (seeded random, tier-item mapping)
- RAID_TIER_CONFIGS integrity (boss_hp, contribution_per_win, escalation)
- weeklyStore isoWeekKey (same week, consecutive weeks, format, new year boundary)
