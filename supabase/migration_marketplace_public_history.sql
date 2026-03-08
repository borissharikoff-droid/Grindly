-- Allow viewing sold/expired listings for price history on wiki
-- Previous policy only allowed viewing 'active' listings

drop policy if exists "Anyone can view active listings" on public.marketplace_listings;

create policy "Anyone can view listings"
  on public.marketplace_listings for select
  using (status in ('active', 'sold', 'expired'));

-- Aggregated price history view for the wiki (no user data exposed)
create or replace view public.marketplace_price_history as
select
  item_id,
  date_trunc('day', created_at)::date as trade_date,
  round(avg(price_gold / quantity))::int as avg_price,
  sum(quantity)::int as volume,
  min(price_gold / quantity)::int as low_price,
  max(price_gold / quantity)::int as high_price,
  count(*)::int as num_trades
from public.marketplace_listings
where status = 'sold'
group by item_id, date_trunc('day', created_at)::date
order by item_id, trade_date;
