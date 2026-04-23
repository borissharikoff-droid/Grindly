/**
 * Canonical skill color palette — single source of truth for runtime use.
 * Imported by skills.ts and by tailwind.config.js (via skillColors.json).
 * Edit skillColors.json to change colors; this file just re-exports with types.
 *
 * NOTE: developer = cyber.neon (#00ff88), gamer = accent (#5865F2).
 */
import rawColors from './skillColors.json'
export const SKILL_COLORS: Record<string, string> = rawColors
