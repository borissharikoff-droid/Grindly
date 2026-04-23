## What's new in v4.10.0

**New**
- Arena battle ambient bar — live boss HP strip on Home while any dungeon/boss battle is active; click to jump to Arena
- Pet level-up skill choices — pick a skill at each level-up for a stacking +1% XP bonus (levels 2–10)
- Off-tab dungeon battles — dungeons keep ticking when you switch away from Arena tab
- QuickActionsArrow — fast goal/task entry from the home screen header

**Improved**
- BottomNav glass polish — backdrop blur, animated active underline, refined active indicator ring
- Production skills (Farmer/Warrior/Crafter/Chef) now render at full visual weight on Skills page
- BattleState memoized — no redundant physics simulation every 250 ms on Home

**Fixed**
- Dual Framer Motion layoutId conflict in BottomNav (could glitch when More menu + active pinned tab)
- message_reactions RLS tightened — participant-scoped SELECT/INSERT (was open to all authenticated users)
- get_email_by_username now rate-limited — prevents email enumeration via username guessing
- Dead StreakBar component removed

---
Released: 2026-04-23
