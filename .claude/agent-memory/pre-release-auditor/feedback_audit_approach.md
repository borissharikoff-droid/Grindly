---
name: Grindly audit approach and conventions
description: How to run pre-release audits for Grindly — what to check, grep patterns, and what to skip
type: feedback
---

When auditing Grindly, follow this approach to get findings quickly.

**Why:** The codebase has consistent patterns and known risk areas. Systematic grep-first reduces reading time.
**How to apply:** Run in this order on every audit.

## Zustand Selector Scan (always first)
```
grep -rn "} = useXxxStore()" src/renderer/components
grep -rn "(s) => ({" src/renderer/components  # object literal selectors
grep -rn "\.filter\|\.map" src/renderer/components  # array transform selectors
```
Flag any that use bare `useStore()` without selector, or return `{ a: s.a, b: s.b }` without `shallow`.

## Items-Before-Confirm Pattern
Look for: inventory `deleteItem` called BEFORE an `await` service call. If the service can fail, items are lost with no refund. Search:
```
grep -n "deleteItem" src/renderer/components
```
Then verify whether a refund exists on failure.

## Reward-Before-Claim Pattern
In persist stores, rewards (gold, chests) should be granted AFTER the claimed flag is set, or in the same synchronous set() call. If granted first and app crashes, the item is duplicated.

## Import audits
After any refactor, check for: duplicate named imports (same function imported under two names), unused imports, and circular deps between stores.

## What NOT to spend time on
- The SQLite migration order is enforced by CLAUDE.md and rarely changes.
- The XP formula and skill definitions are covered by existing tests.
- The progression contract has its own test suite — skip manual review unless specifically asked.

## Running tests
```bash
npx vitest run src/tests/         # all tests
npx vitest run src/tests/foo.test.ts  # specific file
npx tsc --noEmit                  # TS type check
```
1159 tests as of v3.9.0. All should pass before release.
