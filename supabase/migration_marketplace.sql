-- Marketplace: listings and buy RPC
-- Run after migration_inventory.sql and migration_gold.sql

create table if not exists public.marketplace_listings (
  id uuid primary key default uuid_generate_v4(),
  seller_id uuid references public.profiles(id) on delete cascade not null,
  item_id text not null,
  quantity integer not null default 1 check (quantity >= 1),
  price_gold integer not null check (price_gold >= 1),
  created_at timestamptz default now(),
  status text not null default 'active' check (status in ('active', 'sold'))
);

create index if not exists idx_marketplace_listings_seller on public.marketplace_listings(seller_id);
create index if not exists idx_marketplace_listings_status on public.marketplace_listings(status);
create index if not exists idx_marketplace_listings_created on public.marketplace_listings(created_at desc);

alter table public.marketplace_listings enable row level security;

create policy "Anyone can view active listings"
  on public.marketplace_listings for select
  using (status = 'active');

create policy "Sellers can insert own listings"
  on public.marketplace_listings for insert
  with check (auth.uid() = seller_id);

create policy "Sellers can update own listings"
  on public.marketplace_listings for update
  using (auth.uid() = seller_id);

create policy "Sellers can delete own listings"
  on public.marketplace_listings for delete
  using (auth.uid() = seller_id);

-- Atomic buy: transfer gold, add item to buyer, mark sold
create or replace function public.buy_listing(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing record;
  v_buyer_gold int;
  v_seller_gold int;
  v_now timestamptz := now();
  v_buyer_id uuid := auth.uid();
begin
  if v_buyer_id is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  select * into v_listing
  from marketplace_listings
  where id = p_listing_id and status = 'active'
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Listing not found or already sold');
  end if;

  if v_listing.seller_id = v_buyer_id then
    return jsonb_build_object('ok', false, 'error', 'Cannot buy your own listing');
  end if;

  select gold into v_buyer_gold from profiles where id = v_buyer_id for update;
  if not found or v_buyer_gold is null or v_buyer_gold < v_listing.price_gold then
    return jsonb_build_object('ok', false, 'error', 'Insufficient gold');
  end if;

  select gold into v_seller_gold from profiles where id = v_listing.seller_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Seller not found');
  end if;

  -- Deduct buyer gold
  update profiles set gold = gold - v_listing.price_gold, updated_at = v_now where id = v_buyer_id;

  -- Add seller gold
  update profiles set gold = gold + v_listing.price_gold, updated_at = v_now where id = v_listing.seller_id;

  -- Add item to buyer inventory (upsert)
  insert into user_inventory (user_id, item_id, quantity, updated_at)
  values (v_buyer_id, v_listing.item_id, v_listing.quantity, v_now)
  on conflict (user_id, item_id) do update set
    quantity = user_inventory.quantity + v_listing.quantity,
    updated_at = v_now;

  -- Mark listing sold
  update marketplace_listings set status = 'sold' where id = p_listing_id;

  return jsonb_build_object('ok', true, 'item_id', v_listing.item_id, 'quantity', v_listing.quantity);
end;
$$;
