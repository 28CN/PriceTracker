-- Read-only price statistics per tracked link, for the price trend chart and
-- the "real discount" verdict. Reads price_history only; never writes it.
-- security_invoker = true: the caller's RLS on price_history/tracked_links
-- applies, so users only see stats for products they can view.
create or replace view public.price_link_stats
with (security_invoker = true)
as
with ordered as (
  select
    ph.link_id,
    ph.price,
    ph.created_at,
    lag(ph.price) over (partition by ph.link_id order by ph.created_at, ph.id) as prev_price,
    row_number() over (partition by ph.link_id order by ph.created_at desc, ph.id desc) as rn_desc
  from public.price_history ph
)
select
  l.id as link_id,
  l.product_id,
  l.retailer,
  max(o.price) filter (where o.rn_desc = 1) as current_price,
  max(o.created_at) as last_seen_at,
  min(o.price) as all_time_low,
  (array_agg(o.created_at order by o.price, o.created_at))[1] as all_time_low_at,
  min(o.price) filter (where o.created_at >= now() - interval '30 days') as low_30d,
  round(avg(o.price) filter (where o.created_at >= now() - interval '30 days'), 2) as avg_30d,
  max(o.price) filter (where o.created_at >= now() - interval '30 days') as high_30d,
  min(o.price) filter (where o.created_at >= now() - interval '90 days') as low_90d,
  round(avg(o.price) filter (where o.created_at >= now() - interval '90 days'), 2) as avg_90d,
  max(o.price) filter (where o.created_at >= now() - interval '90 days') as high_90d,
  count(o.price)::int as sample_count,
  (count(o.price) filter (where o.created_at >= now() - interval '90 days'))::int as sample_count_90d,
  max(o.created_at) filter (where o.prev_price is not null and o.price <> o.prev_price) as last_change_at
from public.tracked_links l
join ordered o on o.link_id = l.id
group by l.id, l.product_id, l.retailer;

comment on view public.price_link_stats is
  'Per-link price stats from price_history (read-only, security_invoker so RLS applies).';

revoke all on public.price_link_stats from public, anon;
grant select on public.price_link_stats to authenticated, service_role;
