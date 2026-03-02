-- Add equipped_loot and status_title to profiles (for friend profile loadout display)
-- Run this in your Supabase SQL Editor if equipped items don't show in friend profiles

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS equipped_loot jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status_title text;

COMMENT ON COLUMN public.profiles.equipped_loot IS 'Equipped loot by slot: { head, top, accessory, aura } -> item_id';
COMMENT ON COLUMN public.profiles.status_title IS 'Status title from aura/perk (e.g. Pulse Wielder)';
