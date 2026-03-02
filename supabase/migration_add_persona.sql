-- Add persona_id to profiles so friends can see each other's status (Developer, Gamer, Scholar, etc.)
alter table public.profiles add column if not exists persona_id text;

comment on column public.profiles.persona_id is 'Detected focus persona: developer, creative, gamer, social, explorer, music_lover, scholar, grindly';
