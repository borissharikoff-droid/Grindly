-- Inventory sync: user_inventory and user_chests for cloud persistence
-- Run after schema.sql in your Supabase project

-- User inventory: items owned (item_id, quantity)
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

create policy "Users can view own inventory"
  on public.user_inventory for select
  using (auth.uid() = user_id);

create policy "Users can insert own inventory"
  on public.user_inventory for insert
  with check (auth.uid() = user_id);

create policy "Users can update own inventory"
  on public.user_inventory for update
  using (auth.uid() = user_id);

create policy "Users can delete own inventory"
  on public.user_inventory for delete
  using (auth.uid() = user_id);

-- User chests: chest counts by type
create table if not exists public.user_chests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  chest_type text not null check (chest_type in ('common_chest', 'rare_chest', 'epic_chest', 'legendary_chest')),
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz default now(),
  unique(user_id, chest_type)
);

create index if not exists idx_user_chests_user on public.user_chests(user_id);

alter table public.user_chests enable row level security;

create policy "Users can view own chests"
  on public.user_chests for select
  using (auth.uid() = user_id);

create policy "Users can insert own chests"
  on public.user_chests for insert
  with check (auth.uid() = user_id);

create policy "Users can update own chests"
  on public.user_chests for update
  using (auth.uid() = user_id);

create policy "Users can delete own chests"
  on public.user_chests for delete
  using (auth.uid() = user_id);

-- Gifts: sender sends duplicate item to friend (receiver claims)
create table if not exists public.item_gifts (
  id uuid primary key default uuid_generate_v4(),
  sender_id uuid references public.profiles(id) on delete cascade not null,
  receiver_id uuid references public.profiles(id) on delete cascade not null,
  item_id text not null,
  quantity integer not null default 1 check (quantity >= 1),
  status text not null default 'pending' check (status in ('pending', 'claimed')),
  created_at timestamptz default now(),
  claimed_at timestamptz
);

create index if not exists idx_item_gifts_receiver on public.item_gifts(receiver_id);
create index if not exists idx_item_gifts_sender on public.item_gifts(sender_id);

alter table public.item_gifts enable row level security;

create policy "Senders can insert own gifts"
  on public.item_gifts for insert
  with check (auth.uid() = sender_id);

create policy "Receivers can view gifts to them"
  on public.item_gifts for select
  using (auth.uid() = receiver_id or auth.uid() = sender_id);

create policy "Receivers can update (claim) gifts to them"
  on public.item_gifts for update
  using (auth.uid() = receiver_id);
