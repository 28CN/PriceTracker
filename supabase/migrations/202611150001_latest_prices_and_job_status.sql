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
    and ph.created_at is not null
  -- created_at is nullable. The existing index is (link_id, created_at DESC),
  -- and DESC means NULLS FIRST. Filtering nulls out, then ordering the same
  -- way, matches that index. Do not add NULLS LAST or a second index.
  order by ph.link_id, ph.created_at desc;
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

-- Table-level select would also expose requested_by, runner and last_error.
-- Signed-in users only get the columns the card needs. Re-applying this
-- file drops a wider grant if an earlier draft of it was applied.
revoke select on table public.crawl_jobs from authenticated;
grant select (id, product_id, link_id, status, created_at)
  on table public.crawl_jobs to authenticated;

create index if not exists crawl_jobs_product_open_idx
  on public.crawl_jobs (product_id)
  where status = 'pending' or status = 'running';

commit;
