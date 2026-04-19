<div align="center">

<img src="docs/banner.png" alt="Grindly" width="100%">

<br>
<br>

**Your screen time, gamified.**<br>
XP, skills, loot drops, and arena battles — powered by what you actually do on your computer.

<br>

[![Download Windows](https://img.shields.io/badge/Download-Windows_.exe-5865F2?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/borissharikoff-droid/Grindly/releases/latest)
[![Download Mac](https://img.shields.io/badge/Download-macOS_.dmg-black?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/borissharikoff-droid/Grindly/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)
[![Wiki](https://img.shields.io/badge/Wiki-Docs-f59e0b?style=for-the-badge)](https://borissharikoff-droid.github.io/Grindly-Wiki)

</div>

---

## What is Grindly?

Grindly watches what you're doing on your Mac or PC and turns it into an RPG — in real time.

Open VS Code for 3 hours → **Developer** skill levels up. Browse research tabs → **Researcher** XP. Play games → **Gamer**. Every active window is tracked and converted into progression.

<div align="center">
<img src="docs/core-loop.gif" alt="Core loop — session running, skills gaining XP, loot dropping" width="340">
</div>

---

## Features

| | |
|---|---|
| ⏱ **Session Tracker** | Start a grind session. Your active windows are tracked automatically. Stop and collect your rewards. |
| 🎮 **14 Skills** | Developer, Designer, Gamer, Researcher, Creator, Communicator, Learner, Listener, Farmer, Warrior, Crafter, Chef, AI, Grindly. Each has 99 levels + prestige. |
| 🎁 **Loot Drops** | Sessions drop gear at 5 rarity tiers: Common → Rare → Epic → Legendary → Mythic. |
| ⚔️ **Arena** | Turn-based boss battles. Your equipped gear stats determine your ATK and HP. Unlock 6 zones. |
| ⚒️ **Crafting & Farming** | Salvage gear for materials. Grow plants. Craft better equipment. |
| 🏪 **Marketplace** | Player-to-player trading. Buy and sell loot for gold. |
| 👥 **Party System** | Add friends, see their sessions live, chat in real time. |
| 🎮 **Discord Rich Presence** | Your grind status shows on your Discord profile — skill, level, streak, timer. |
| 🔥 **Streak System** | Daily streaks with XP multipliers. Break it and you'll feel it. |

---

## Screenshots

<div align="center">
<img src="docs/screen-home.png" width="260" alt="Home — session running">
<img src="docs/screen-skills.png" width="260" alt="Skills — XP and levels">
<img src="docs/screen-arena.png" width="260" alt="Arena — boss fight">
</div>

---

## Install

### Windows
1. Download `Grindly-Setup-x.x.x.exe` from **[Releases](https://github.com/borissharikoff-droid/Grindly/releases/latest)**
2. Run the installer — SmartScreen may warn you since the app isn't signed yet. Click **More info → Run anyway**.
3. Grindly starts in the system tray.

### macOS
1. Download `Grindly-x.x.x.dmg` from **[Releases](https://github.com/borissharikoff-droid/Grindly/releases/latest)**
2. Open the .dmg and drag Grindly to Applications.
3. Grindly is not yet code-signed. If macOS blocks it on first launch, run:
   ```bash
   xattr -cr /Applications/Grindly.app
   ```
   Then double-click to open normally. (Adjust the path if you installed it elsewhere.)
4. Grindly appears in the Dock.

> **No account required.** Social features (friends, leaderboard, marketplace) are optional and require a free account.

---

## Tech Stack

Electron · React · TypeScript · Tailwind CSS · SQLite · Supabase · Framer Motion

---

## Development

**Prerequisites:** Node.js 22+

```bash
git clone https://github.com/borissharikoff-droid/Grindly
cd idly
npm install
npm run electron:dev
```

No `.env` needed — the app connects to the shared Supabase project by default.

> Self-hosting? Copy `.env.example` to `.env` and fill in your own Supabase credentials.

**Note:** `npm run dev` is renderer-only (browser preview, no Electron APIs). Use `npm run electron:dev` for the full app.

### Code map

| What you want to change | Where |
|-------------------------|-------|
| XP formula / level curve | `src/renderer/lib/xp.ts` |
| Skills (names, categories, colors) | `src/renderer/lib/skills.ts` |
| Items, loot, chests | `src/renderer/lib/loot.ts` |
| Arena zones and bosses | `src/renderer/lib/combat.ts` |
| Activity tracking (window detection) | `src/main/tracker.ts` |
| IPC channels (main ↔ renderer) | `src/shared/ipcChannels.ts` |
| Session logic, XP, achievements | `src/renderer/stores/sessionStore.ts` |
| SQLite migrations | `src/main/migrations/index.ts` |

**Database:** Migrations in `src/main/migrations/index.ts` are **append-only** — never edit or reorder existing entries, always add new ones at the end.

### Troubleshooting

If you see a native module error (`The module was compiled against a different Node.js version`):
```bash
npx electron-rebuild -f -w better-sqlite3
```

### Tests

```bash
npm test                                          # run all tests
npx vitest run src/tests/xp.test.ts               # run a single test file
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add new skills, items, arena zones, and more.

---

## License

MIT — free to use, modify, and distribute.
