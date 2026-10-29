-- One row per tracked link per UTC day with that day's lowest price, so the
-- price-insight API reads at most (links x days) rows instead of every crawl.
-- Read-only: aggregates price_history and never writes it.
-- security_invoker = true: the caller's RLS on price_history/tracked_links applies.
create or replace view public.price_link_daily
with (security_invoker = true)
as
select
  ph.link_id,
  l.product_id,
  (ph.created_at at time zone 'UTC')::date as day,
  min(ph.price) as min_price,
  max(ph.created_at) as last_at,
  count(*)::int as samples
from public.price_history ph
join public.tracked_links l on l.id = ph.link_id
group by ph.link_id, l.product_id, (ph.created_at at time zone 'UTC')::date;

comment on view public.price_link_daily is
  'Daily (UTC) minimum price per link from price_history (read-only, security_invoker so RLS applies).';

revoke all on public.price_link_daily from public, anon;
grant select on public.price_link_daily to authenticated, service_role;
