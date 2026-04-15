/**
 * Canonical skill color palette — single source of truth for runtime use.
 * Imported by skills.ts. tailwind.config.js holds a manual duplicate (Node
 * cannot import .ts files at build time) — keep both in sync when changing colors.
 *
 * NOTE: developer = cyber.neon (#00ff88), gamer = accent (#5865F2).
 * Those aliases are intentional — skills share the brand palette.
 */
export const SKILL_COLORS: Record<string, string> = {
  developer:    '#00ff88',
  designer:     '#ff6b9d',
  gamer:        '#5865F2',
  communicator: '#57F287',
  researcher:   '#faa61a',
  creator:      '#eb459e',
  learner:      '#00d4ff',
  listener:     '#1db954',
  farmer:       '#84cc16',
  warrior:      '#EF4444',
  crafter:      '#f97316',
  chef:         '#fb923c',
  ai:           '#818cf8',
  grindly:      '#c084fc',
}
