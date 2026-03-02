-- Marketplace: cancel listing (remove from sale), auto-expire after 7 days
-- Run after migration_marketplace.sql

-- Allow new statuses: cancelled (seller removed), expired (7+ days)
alter table public.marketplace_listings
  drop constraint if exists marketplace_listings_status_check;

alter table public.marketplace_listings
  add constraint marketplace_listings_status_check
  check (status in ('active', 'sold', 'cancelled', 'expired'));

-- Cancel listing: seller removes from sale, item returns to inventory
create or replace function public.cancel_listing(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing record;
  v_seller_id uuid := auth.uid();
begin
  if v_seller_id is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  select * into v_listing
  from marketplace_listings
  where id = p_listing_id and status = 'active'
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Listing not found or not active');
  end if;

  if v_listing.seller_id != v_seller_id then
    return jsonb_build_object('ok', false, 'error', 'Not your listing');
  end if;

  -- Return item to seller inventory
  insert into user_inventory (user_id, item_id, quantity, updated_at)
  values (v_seller_id, v_listing.item_id, v_listing.quantity, now())
  on conflict (user_id, item_id) do update set
    quantity = user_inventory.quantity + v_listing.quantity,
    updated_at = now();

  -- Mark cancelled
  update marketplace_listings set status = 'cancelled' where id = p_listing_id;

  return jsonb_build_object('ok', true, 'item_id', v_listing.item_id, 'quantity', v_listing.quantity);
end;
$$;

grant execute on function public.cancel_listing(uuid) to authenticated;
grant execute on function public.cancel_listing(uuid) to anon;

-- Expire old listings: active listings older than 7 days -> expired, return items
-- Call this from client or cron (e.g. when fetching listings)
create or replace function public.expire_old_listings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing record;
  v_count int := 0;
begin
  for v_listing in
    select id, seller_id, item_id, quantity
    from marketplace_listings
    where status = 'active' and created_at < now() - interval '7 days'
    for update
  loop
    -- Return item to seller
    insert into user_inventory (user_id, item_id, quantity, updated_at)
    values (v_listing.seller_id, v_listing.item_id, v_listing.quantity, now())
    on conflict (user_id, item_id) do update set
      quantity = user_inventory.quantity + v_listing.quantity,
      updated_at = now();

    update marketplace_listings set status = 'expired' where id = v_listing.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.expire_old_listings() to authenticated;
grant execute on function public.expire_old_listings() to anon;
