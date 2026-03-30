-- Add platform and client_version tracking to profiles
-- platform: 'win32' | 'darwin' | 'linux' — populated by Electron client on sync
-- client_version: semver string e.g. '4.6.1' — from app.getVersion()
-- Both are nullable (pre-migration users will have NULL, shown as "Unknown" in dashboard)

alter table public.profiles
  add column if not exists platform text check (char_length(platform) < 20),
  add column if not exists client_version text check (char_length(client_version) < 20),
  add column if not exists created_at timestamptz default now();

-- Backfill created_at from auth.users for existing profiles
update public.profiles p
set created_at = u.created_at
from auth.users u
where u.id = p.id and p.created_at is null;

-- Index for fast GROUP BY on platform (used by dashboard platform distribution query)
create index if not exists idx_profiles_platform on public.profiles(platform);
