-- Delve Mode — "Abyss Descent"
-- New table for HC leaderboard + profile columns for max-floor tracking
-- + cosmetics unlock tracking.
--
-- Apply via: mcp__supabase__apply_migration(name='delve', query=this file)

-- ── delve_runs: every completed or failed run submits here ──────────────────

create table if not exists public.delve_runs (
  run_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('casual','hardcore')),
  final_floor integer not null default 0,
  died boolean not null default false,
  staked_items_json jsonb,
  loot_gained_json jsonb,
  gold_gained integer default 0,
  duration_s integer,
  week_iso text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  client_version text
);

-- Leaderboard query: top N by floor for a given week + mode
create index if not exists idx_delve_runs_leaderboard
  on public.delve_runs (week_iso, mode, final_floor desc);

-- User's own run history
create index if not exists idx_delve_runs_user
  on public.delve_runs (user_id, started_at desc);

-- Profile columns for max-floor tracking + cosmetics
alter table public.profiles
  add column if not exists max_delve_floor_hc integer default 0,
  add column if not exists max_delve_floor_casual integer default 0,
  add column if not exists delve_cosmetics_unlocked text[] default '{}';

-- ── Anti-cheat heartbeat ────────────────────────────────────────────────────
-- Client submits one row per floor advance. Server records its own timestamp.
-- Final submission validates the heartbeat chain.

create table if not exists public.delve_run_heartbeats (
  run_id text not null references public.delve_runs(run_id) on delete cascade,
  floor integer not null,
  server_ts timestamptz not null default now(),
  primary key (run_id, floor)
);

create index if not exists idx_delve_heartbeats_run
  on public.delve_run_heartbeats (run_id, floor);

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.delve_runs enable row level security;
alter table public.delve_run_heartbeats enable row level security;

-- Users can insert their own runs
drop policy if exists "delve_runs_insert_own" on public.delve_runs;
create policy "delve_runs_insert_own" on public.delve_runs
  for insert with check (auth.uid() = user_id);

-- Users can read their own runs
drop policy if exists "delve_runs_read_own" on public.delve_runs;
create policy "delve_runs_read_own" on public.delve_runs
  for select using (auth.uid() = user_id);

-- Public leaderboard read (top-N queries joined with profiles for display_name)
drop policy if exists "delve_runs_leaderboard" on public.delve_runs;
create policy "delve_runs_leaderboard" on public.delve_runs
  for select using (true);

-- Heartbeats: users insert + read their own
drop policy if exists "delve_heartbeats_insert_own" on public.delve_run_heartbeats;
create policy "delve_heartbeats_insert_own" on public.delve_run_heartbeats
  for insert with check (
    exists (select 1 from public.delve_runs r where r.run_id = delve_run_heartbeats.run_id and r.user_id = auth.uid())
  );

drop policy if exists "delve_heartbeats_read_own" on public.delve_run_heartbeats;
create policy "delve_heartbeats_read_own" on public.delve_run_heartbeats
  for select using (
    exists (select 1 from public.delve_runs r where r.run_id = delve_run_heartbeats.run_id and r.user_id = auth.uid())
  );

-- ── RPC: submit run end with anti-cheat validation ──────────────────────────

create or replace function public.submit_delve_run_end(
  p_run_id text,
  p_final_floor integer,
  p_died boolean,
  p_gold_gained integer,
  p_duration_s integer,
  p_loot_json jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_run record;
  v_hb_count integer;
  v_min_time integer;
  v_mode text;
  v_is_valid boolean := true;
  v_reason text := null;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  select * into v_run from public.delve_runs where run_id = p_run_id and user_id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'run_not_found');
  end if;

  v_mode := v_run.mode;

  -- Anti-cheat: minimum 6 seconds per floor for bass-case plays.
  -- (Gives buffer over the 0.5s tick + food prep time.)
  v_min_time := p_final_floor * 6;
  if p_duration_s < v_min_time then
    v_is_valid := false;
    v_reason := 'floor_time_too_fast';
  end if;

  -- Anti-cheat: heartbeat count must cover claimed floor (allow 2-floor tolerance for burst)
  select count(*) into v_hb_count from public.delve_run_heartbeats where run_id = p_run_id;
  if v_hb_count < p_final_floor - 2 then
    v_is_valid := false;
    v_reason := coalesce(v_reason, 'heartbeat_gap');
  end if;

  -- Update run record
  update public.delve_runs
    set final_floor = p_final_floor,
        died = p_died,
        gold_gained = p_gold_gained,
        duration_s = p_duration_s,
        loot_gained_json = p_loot_json,
        ended_at = now()
    where run_id = p_run_id;

  -- Only update max floor if valid
  if v_is_valid then
    if v_mode = 'hardcore' then
      update public.profiles
        set max_delve_floor_hc = greatest(coalesce(max_delve_floor_hc, 0), p_final_floor)
        where id = v_uid;
    else
      update public.profiles
        set max_delve_floor_casual = greatest(coalesce(max_delve_floor_casual, 0), p_final_floor)
        where id = v_uid;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'valid', v_is_valid, 'reason', v_reason);
end;
$$;

grant execute on function public.submit_delve_run_end(text, integer, boolean, integer, integer, jsonb) to authenticated;

-- ── RPC: unlock a cosmetic (idempotent) ─────────────────────────────────────

create or replace function public.unlock_delve_cosmetic(p_cosmetic_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;
  update public.profiles
    set delve_cosmetics_unlocked =
      case
        when delve_cosmetics_unlocked @> array[p_cosmetic_id]
          then delve_cosmetics_unlocked
        else coalesce(delve_cosmetics_unlocked, '{}') || array[p_cosmetic_id]
      end
    where id = v_uid;
  return true;
end;
$$;

grant execute on function public.unlock_delve_cosmetic(text) to authenticated;
