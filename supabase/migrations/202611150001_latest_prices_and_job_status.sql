-- Latest price per link, and a way for someone to see if their own check
-- is queued or running.
--
-- APPLY THIS TO PRODUCTION BEFORE MERGE. It does not delete or rewrite
-- price_history. No role is granted TRUNCATE.

begin;

-- Indexed "newest row per link". security invoker: the caller's row-level
-- security on price_history still applies, so one person cannot read another's.
create or replace function public.latest_link_prices(link_ids uuid[])
returns table (link_id uuid, price numeric, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (ph.link_id)
    ph.link_id,
    ph.price,
    ph.created_at
  from public.price_history ph
  where ph.link_id = any (link_ids)
  order by ph.link_id, ph.created_at desc nulls last, ph.id desc;
$$;

revoke all on function public.latest_link_prices(uuid[]) from public, anon, authenticated;
grant execute on function public.latest_link_prices(uuid[]) to anon, authenticated, service_role;

-- Owners can read job status for their own products. They cannot insert,
-- update, or delete jobs through this policy. Jobs with no product (an
-- administrator refreshing every account) stay hidden.
drop policy if exists "owners read own crawl jobs" on public.crawl_jobs;
create policy "owners read own crawl jobs"
on public.crawl_jobs
for select
to authenticated
using ((product_id is not null) and owns_product(product_id));

grant select on public.crawl_jobs to authenticated;

create index if not exists crawl_jobs_product_open_idx
  on public.crawl_jobs (product_id)
  where status = 'pending' or status = 'running';

commit;
