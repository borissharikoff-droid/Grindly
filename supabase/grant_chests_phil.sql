-- Grant user Phil 2 different chests (1 rare, 1 epic)
-- Run in Supabase SQL Editor. Phil must exist in profiles (username = 'Phil').

INSERT INTO public.user_chests (user_id, chest_type, quantity, updated_at)
SELECT p.id, 'rare_chest', 1, now()
FROM public.profiles p
WHERE p.username = 'Phil'
ON CONFLICT (user_id, chest_type) DO UPDATE SET
  quantity = user_chests.quantity + 1,
  updated_at = now();

INSERT INTO public.user_chests (user_id, chest_type, quantity, updated_at)
SELECT p.id, 'epic_chest', 1, now()
FROM public.profiles p
WHERE p.username = 'Phil'
ON CONFLICT (user_id, chest_type) DO UPDATE SET
  quantity = user_chests.quantity + 1,
  updated_at = now();
