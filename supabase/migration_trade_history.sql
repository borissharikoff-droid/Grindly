-- Trade history table for wiki price charts.
-- Every buy (full or partial) logs a row here.
-- SELECT is open to everyone (no user data exposed).

create table if not exists public.trade_history (
  id uuid primary key default uuid_generate_v4(),
  item_id text not null,
  quantity integer not null default 1,
  unit_price integer not null,
  total_gold integer not null,
  traded_at timestamptz default now()
);

create index if not exists idx_trade_history_item on public.trade_history(item_id, traded_at);

alter table public.trade_history enable row level security;

-- Anyone can read trade history (public data, no user info)
create policy "Anyone can read trade history"
  on public.trade_history for select
  using (true);

-- Only security definer functions insert (via buy RPCs)
create policy "No direct inserts"
  on public.trade_history for insert
  with check (false);

-- ── Update partial_buy_listing to log trade ──
create or replace function public.partial_buy_listing(p_listing_id uuid, p_quantity integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing record;
  v_buyer_gold int;
  v_cost int;
  v_now timestamptz := now();
  v_buyer_id uuid := auth.uid();
begin
  if v_buyer_id is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  if p_quantity < 1 then
    return jsonb_build_object('ok', false, 'error', 'Quantity must be at least 1');
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

  if p_quantity > v_listing.quantity then
    return jsonb_build_object('ok', false, 'error', 'Not enough quantity available');
  end if;

  v_cost := v_listing.price_gold * p_quantity;

  select gold into v_buyer_gold from profiles where id = v_buyer_id for update;
  if not found or v_buyer_gold is null or v_buyer_gold < v_cost then
    return jsonb_build_object('ok', false, 'error', 'Insufficient gold');
  end if;

  perform 1 from profiles where id = v_listing.seller_id for update;

  update profiles set gold = gold - v_cost, updated_at = v_now where id = v_buyer_id;
  update profiles set gold = gold + v_cost, updated_at = v_now where id = v_listing.seller_id;

  insert into user_inventory (user_id, item_id, quantity, updated_at)
  values (v_buyer_id, v_listing.item_id, p_quantity, v_now)
  on conflict (user_id, item_id) do update set
    quantity = user_inventory.quantity + p_quantity,
    updated_at = v_now;

  if p_quantity >= v_listing.quantity then
    update marketplace_listings set status = 'sold' where id = p_listing_id;
  else
    update marketplace_listings
    set quantity = v_listing.quantity - p_quantity
    where id = p_listing_id;
  end if;

  -- Log trade for wiki price history
  insert into trade_history (item_id, quantity, unit_price, total_gold, traded_at)
  values (v_listing.item_id, p_quantity, v_listing.price_gold, v_cost, v_now);

  return jsonb_build_object(
    'ok', true,
    'item_id', v_listing.item_id,
    'quantity', p_quantity,
    'cost', v_cost
  );
end;
$$;

-- ── Update buy_listing to log trade ──
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

  update profiles set gold = gold - v_listing.price_gold, updated_at = v_now where id = v_buyer_id;
  update profiles set gold = gold + v_listing.price_gold, updated_at = v_now where id = v_listing.seller_id;

  insert into user_inventory (user_id, item_id, quantity, updated_at)
  values (v_buyer_id, v_listing.item_id, v_listing.quantity, v_now)
  on conflict (user_id, item_id) do update set
    quantity = user_inventory.quantity + v_listing.quantity,
    updated_at = v_now;

  update marketplace_listings set status = 'sold' where id = p_listing_id;

  -- Log trade for wiki price history
  insert into trade_history (item_id, quantity, unit_price, total_gold, traded_at)
  values (v_listing.item_id, v_listing.quantity, v_listing.price_gold, v_listing.price_gold * v_listing.quantity, v_now);

  return jsonb_build_object('ok', true, 'item_id', v_listing.item_id, 'quantity', v_listing.quantity);
end;
$$;
