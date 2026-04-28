# Grindly Design System

Dark MMO/RPG productivity tracker. Compact, utility-focused — data readability over decoration.

---

## Surfaces (4 levels)

| Token | Value | Use |
|-------|-------|-----|
| `surface-0` | `#111214` | App root, deepest background |
| `surface-1` | `#1e2024` | Page bg, nav bar |
| `surface-2` | `#2b2d31` | Cards, panels, modals |
| `surface-3` | `#36393f` | Hover states, inputs, elevated |

Never use raw Tailwind `bg-zinc-*` or `bg-gray-*` — always use `bg-surface-N`.

---

## Colors

### Chrome accent
`#5865F2` — used for interactive UI chrome (buttons, active states, links, focus rings).

### Skill ambient
`--skill-glow` / `--skill-hex` CSS variables — updated at runtime by `useSkillAmbient` hook based on the active session skill. The app's background gradient and timer color track the user's current skill automatically.

### Skill palette (14 skills)
Defined in `src/renderer/lib/skillColors.ts` (runtime) and `tailwind.config.js` (build-time, `skill.*` tokens). Keep both in sync.

| Skill | Color |
|-------|-------|
| developer | `#00ff88` |
| designer | `#ff6b9d` |
| gamer | `#5865F2` |
| communicator | `#57F287` |
| researcher | `#faa61a` |
| creator | `#eb459e` |
| learner | `#00d4ff` |
| listener | `#1db954` |
| farmer | `#84cc16` |
| warrior | `#EF4444` |
| crafter | `#f97316` |
| chef | `#fb923c` |
| ai | `#818cf8` |
| grindly | `#c084fc` |

### Semantic colors
Use skill token values instead of raw Tailwind colors where possible:
- Warning/at-risk: `#f97316` = `skill.crafter` (orange)
- Success/ready: `#00ff88` = `skill.developer` (neon green)
- Error/danger: `#EF4444` = `skill.warrior` (red)

---

## Typography

### Fonts
- **Display/body:** `Inter` (sans) — for labels, descriptions, UI text
- **Numeric/mono:** `JetBrains Mono` (mono) — for all numbers, timers, counters, XP values, gold, level badges

### Rule: `font-mono` applies to
- All timer displays
- XP, gold, and level numbers
- Session elapsed time
- Badge counts
- Progress percentages

### Type scale (semantic tokens)
| Token | Size | Use |
|-------|------|-----|
| `text-micro` | 10px | Badges, stat values, nav labels |
| `text-caption` | 11px | Timestamps, hints, secondary labels |
| `text-body` / (default) | 13px | Default body text |
| `text-sm` (Tailwind) | 14px | Titles, headings |
| `text-xs` (Tailwind) | 12px | Secondary labels |

---

## Border Radius

| Token | Value | Use |
|-------|-------|-----|
| `rounded` (default) | 4px | All UI elements — buttons, inputs, cards, pills |
| `rounded-card` | 8px | Large surfaces — modals, page cards |
| `rounded-md` | 6px | Context menus, tooltips only |
| `rounded-full` | 9999px | Circles, status pills |

---

## Shadows

| Token | Use |
|-------|-----|
| `shadow-card` | Standard card elevation |
| `shadow-modal` | Modal overlay |
| `shadow-popup` | Dropdowns, tooltips |
| `shadow-nav` | Top edge of bottom nav bar |

Glows (`shadow-game-glow-*`) are game-only — not for UI chrome.

---

## Spacing

4-step scale via CSS variables:
- `--grindly-space-xs` = 0.25rem (4px)
- `--grindly-space-sm` = 0.5rem (8px)
- `--grindly-space-md` = 0.75rem (12px)
- `--grindly-space-lg` = 1rem (16px)

---

## Interaction States

All interactive elements must have:
- `hover:` visual change (color or background)
- `focus-visible:ring-2 focus-visible:ring-accent` keyboard focus ring
- `transition-colors` or `transition-all` for smooth state changes

---

## Skill Ambient Theming

The app's background glow and running session UI colors follow the active skill:

- `--skill-glow` CSS variable (space-separated RGB) drives the `grindly-root-bg` radial gradient
- `--skill-hex` CSS variable (hex string) drives the Timer text color and CurrentActivity border
- Defaults: `88 101 242` / `#5865F2` (accent violet) when idle
- Updated by `src/renderer/hooks/useSkillAmbient.ts` mounted in `HomePage`

When the user is coding (`category: 'coding'` → `skill: developer` → `#00ff88`):
- Background ambient glows neon green
- Timer displays in neon green
- CurrentActivity card border glows neon green

---

## Anti-patterns

Never:
- Use `bg-zinc-*`, `bg-gray-*`, `bg-neutral-*` — use `bg-surface-N`
- Use `text-xs` or `text-sm` for numeric values — use `font-mono`
- Add decorative blobs, wavy dividers, or floating shapes
- Use `color: accent` for game-specific UI — use `cyber.neon` or `skill.*` colors
- Use border-radius > 8px except for `rounded-full` pills/circles
