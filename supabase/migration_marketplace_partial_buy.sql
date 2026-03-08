-- Partial buy: buy a subset of a listing's quantity.
-- Transfers gold to seller, adds item to buyer, adjusts or closes the listing.
-- Run after migration_marketplace.sql

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

  -- Lock and fetch listing
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

  -- price_gold is the UNIT price; total cost = unit price * qty
  v_cost := v_listing.price_gold * p_quantity;

  -- Verify buyer has enough gold
  select gold into v_buyer_gold from profiles where id = v_buyer_id for update;
  if not found or v_buyer_gold is null or v_buyer_gold < v_cost then
    return jsonb_build_object('ok', false, 'error', 'Insufficient gold');
  end if;

  -- Lock seller row
  perform 1 from profiles where id = v_listing.seller_id for update;

  -- Gold transfer: deduct from buyer
  update profiles set gold = gold - v_cost, updated_at = v_now where id = v_buyer_id;

  -- Gold transfer: credit seller
  update profiles set gold = gold + v_cost, updated_at = v_now where id = v_listing.seller_id;

  -- Add item to buyer inventory (upsert)
  insert into user_inventory (user_id, item_id, quantity, updated_at)
  values (v_buyer_id, v_listing.item_id, p_quantity, v_now)
  on conflict (user_id, item_id) do update set
    quantity = user_inventory.quantity + p_quantity,
    updated_at = v_now;

  -- Adjust or close the listing
  if p_quantity >= v_listing.quantity then
    update marketplace_listings set status = 'sold' where id = p_listing_id;
  else
    update marketplace_listings
    set quantity = v_listing.quantity - p_quantity
    where id = p_listing_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'item_id', v_listing.item_id,
    'quantity', p_quantity,
    'cost', v_cost
  );
end;
$$;
