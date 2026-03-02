-- Fix equipped_loot column: ensure it is jsonb (not integer)
-- Run in Supabase SQL Editor if equipped loot shows as 0 or doesn't sync
-- If column was created as wrong type, this drops and recreates it

ALTER TABLE public.profiles DROP COLUMN IF EXISTS equipped_loot;
ALTER TABLE public.profiles ADD COLUMN equipped_loot jsonb DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.profiles.equipped_loot IS 'Equipped loot by slot: { head, top, accessory, aura } -> item_id';

-- Fix any rows with invalid jsonb (e.g. numeric 0)
UPDATE public.profiles
SET equipped_loot = '{}'::jsonb
WHERE equipped_loot IS NULL OR jsonb_typeof(equipped_loot) != 'object';
