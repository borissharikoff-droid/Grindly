-- Create user_inventory if missing (required for cancel_listing)
-- Run this in Supabase SQL Editor if you get "relation user_inventory does not exist"

create table if not exists public.user_inventory (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  item_id text not null,
  quantity integer not null default 1 check (quantity >= 0),
  first_acquired_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, item_id)
);

create index if not exists idx_user_inventory_user on public.user_inventory(user_id);

alter table public.user_inventory enable row level security;

drop policy if exists "Users can view own inventory" on public.user_inventory;
create policy "Users can view own inventory"
  on public.user_inventory for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own inventory" on public.user_inventory;
create policy "Users can insert own inventory"
  on public.user_inventory for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own inventory" on public.user_inventory;
create policy "Users can update own inventory"
  on public.user_inventory for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own inventory" on public.user_inventory;
create policy "Users can delete own inventory"
  on public.user_inventory for delete
  using (auth.uid() = user_id);
