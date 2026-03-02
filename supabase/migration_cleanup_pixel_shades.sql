-- One-time cleanup: cancel pixel_shades listings (return item to seller, mark cancelled)
-- Run this if the Remove button doesn't work or listing is stale

do $$
declare
  r record;
begin
  for r in
    select id, seller_id, item_id, quantity
    from marketplace_listings
    where item_id = 'pixel_shades' and status = 'active'
  loop
    insert into user_inventory (user_id, item_id, quantity, updated_at)
    values (r.seller_id, r.item_id, r.quantity, now())
    on conflict (user_id, item_id) do update set
      quantity = user_inventory.quantity + r.quantity,
      updated_at = now();
    update marketplace_listings set status = 'cancelled' where id = r.id;
  end loop;
end $$;
