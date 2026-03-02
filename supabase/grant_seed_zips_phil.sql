-- Grant user Phil 50 Seed Zips of each tier (common, rare, epic, legendary)
-- Run in Supabase SQL Editor. Phil must exist in profiles (username ILIKE 'phil').
-- Seed Zips are stored in user_inventory; the app merges them into farmStore on sync.

INSERT INTO public.user_inventory (user_id, item_id, quantity, updated_at)
SELECT p.id, 'seed_zip_common', 50, now()
FROM public.profiles p
WHERE p.username ILIKE 'phil'
ON CONFLICT (user_id, item_id) DO UPDATE SET
  quantity = user_inventory.quantity + 50,
  updated_at = now();

INSERT INTO public.user_inventory (user_id, item_id, quantity, updated_at)
SELECT p.id, 'seed_zip_rare', 50, now()
FROM public.profiles p
WHERE p.username ILIKE 'phil'
ON CONFLICT (user_id, item_id) DO UPDATE SET
  quantity = user_inventory.quantity + 50,
  updated_at = now();

INSERT INTO public.user_inventory (user_id, item_id, quantity, updated_at)
SELECT p.id, 'seed_zip_epic', 50, now()
FROM public.profiles p
WHERE p.username ILIKE 'phil'
ON CONFLICT (user_id, item_id) DO UPDATE SET
  quantity = user_inventory.quantity + 50,
  updated_at = now();

INSERT INTO public.user_inventory (user_id, item_id, quantity, updated_at)
SELECT p.id, 'seed_zip_legendary', 50, now()
FROM public.profiles p
WHERE p.username ILIKE 'phil'
ON CONFLICT (user_id, item_id) DO UPDATE SET
  quantity = user_inventory.quantity + 50,
  updated_at = now();
