-- Grant user Phil 20 seeds of each rarity
-- Run in Supabase SQL Editor. Phil must exist in profiles (username ILIKE 'phil').
-- Seeds are stored in user_inventory; the app merges them into farmStore on sync.
--
-- Optional: run first to verify Phil exists:
--   SELECT id, username FROM profiles WHERE username ILIKE '%phil%';

INSERT INTO public.user_inventory (user_id, item_id, quantity, updated_at)
SELECT p.id, 'wheat_seed', 20, now()
FROM public.profiles p
WHERE p.username ILIKE 'phil'
ON CONFLICT (user_id, item_id) DO UPDATE SET
  quantity = user_inventory.quantity + 20,
  updated_at = now();

INSERT INTO public.user_inventory (user_id, item_id, quantity, updated_at)
SELECT p.id, 'herb_seed', 20, now()
FROM public.profiles p
WHERE p.username ILIKE 'phil'
ON CONFLICT (user_id, item_id) DO UPDATE SET
  quantity = user_inventory.quantity + 20,
  updated_at = now();

INSERT INTO public.user_inventory (user_id, item_id, quantity, updated_at)
SELECT p.id, 'apple_seed', 20, now()
FROM public.profiles p
WHERE p.username ILIKE 'phil'
ON CONFLICT (user_id, item_id) DO UPDATE SET
  quantity = user_inventory.quantity + 20,
  updated_at = now();

INSERT INTO public.user_inventory (user_id, item_id, quantity, updated_at)
SELECT p.id, 'blossom_seed', 20, now()
FROM public.profiles p
WHERE p.username ILIKE 'phil'
ON CONFLICT (user_id, item_id) DO UPDATE SET
  quantity = user_inventory.quantity + 20,
  updated_at = now();

INSERT INTO public.user_inventory (user_id, item_id, quantity, updated_at)
SELECT p.id, 'clover_seed', 20, now()
FROM public.profiles p
WHERE p.username ILIKE 'phil'
ON CONFLICT (user_id, item_id) DO UPDATE SET
  quantity = user_inventory.quantity + 20,
  updated_at = now();

INSERT INTO public.user_inventory (user_id, item_id, quantity, updated_at)
SELECT p.id, 'orchid_seed', 20, now()
FROM public.profiles p
WHERE p.username ILIKE 'phil'
ON CONFLICT (user_id, item_id) DO UPDATE SET
  quantity = user_inventory.quantity + 20,
  updated_at = now();

INSERT INTO public.user_inventory (user_id, item_id, quantity, updated_at)
SELECT p.id, 'starbloom_seed', 20, now()
FROM public.profiles p
WHERE p.username ILIKE 'phil'
ON CONFLICT (user_id, item_id) DO UPDATE SET
  quantity = user_inventory.quantity + 20,
  updated_at = now();

INSERT INTO public.user_inventory (user_id, item_id, quantity, updated_at)
SELECT p.id, 'crystal_seed', 20, now()
FROM public.profiles p
WHERE p.username ILIKE 'phil'
ON CONFLICT (user_id, item_id) DO UPDATE SET
  quantity = user_inventory.quantity + 20,
  updated_at = now();

INSERT INTO public.user_inventory (user_id, item_id, quantity, updated_at)
SELECT p.id, 'void_spore', 20, now()
FROM public.profiles p
WHERE p.username ILIKE 'phil'
ON CONFLICT (user_id, item_id) DO UPDATE SET
  quantity = user_inventory.quantity + 20,
  updated_at = now();
