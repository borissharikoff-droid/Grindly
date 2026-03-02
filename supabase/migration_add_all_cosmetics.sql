-- Add ALL cosmetics columns to profiles (run in Supabase SQL Editor)
-- Fixes: "Could not find the 'equipped_badges' column of 'profiles' in the schema cache"

-- Cosmetics (badges + frame)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS equipped_badges TEXT[] DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS equipped_frame TEXT;

-- Equipped loot (items) + status title
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS equipped_loot jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status_title TEXT;

COMMENT ON COLUMN public.profiles.equipped_badges IS 'Array of equipped badge IDs';
COMMENT ON COLUMN public.profiles.equipped_frame IS 'Currently equipped profile frame ID';
COMMENT ON COLUMN public.profiles.equipped_loot IS 'Equipped loot by slot: { head, top, accessory, aura } -> item_id';
COMMENT ON COLUMN public.profiles.status_title IS 'Status title from aura/perk';
