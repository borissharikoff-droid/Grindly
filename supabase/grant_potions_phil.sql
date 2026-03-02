-- Grant user Phil 10 of each permanent-stat potion
-- Run in Supabase SQL Editor. Phil must exist in profiles (username = 'Phil').

INSERT INTO public.user_inventory (user_id, item_id, quantity, updated_at)
SELECT p.id, 'atk_potion', 10, now()
FROM public.profiles p
WHERE p.username = 'Phil'
ON CONFLICT (user_id, item_id) DO UPDATE SET
  quantity = user_inventory.quantity + 10,
  updated_at = now();

INSERT INTO public.user_inventory (user_id, item_id, quantity, updated_at)
SELECT p.id, 'hp_potion', 10, now()
FROM public.profiles p
WHERE p.username = 'Phil'
ON CONFLICT (user_id, item_id) DO UPDATE SET
  quantity = user_inventory.quantity + 10,
  updated_at = now();

INSERT INTO public.user_inventory (user_id, item_id, quantity, updated_at)
SELECT p.id, 'regen_potion', 10, now()
FROM public.profiles p
WHERE p.username = 'Phil'
ON CONFLICT (user_id, item_id) DO UPDATE SET
  quantity = user_inventory.quantity + 10,
  updated_at = now();
