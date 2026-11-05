-- Shop search (SerpApi Google Shopping): shared 24h result cache and per-user
-- live-call counters. Server-only tables: RLS on, no policies, no client grants.
create table if not exists public.product_search_cache (
  query_key text primary key check (length(query_key) between 1 and 200),
  results jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);

create table if not exists public.product_search_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  calls integer not null default 0 check (calls >= 0),
  primary key (user_id, day)
);

create index if not exists product_search_usage_day on public.product_search_usage (day);

alter table public.product_search_cache enable row level security;
alter table public.product_search_usage enable row level security;

-- Explicit grants (no TRUNCATE for anyone), consistent with 202610290012.
revoke all on public.product_search_cache from public, anon, authenticated, service_role;
revoke all on public.product_search_usage from public, anon, authenticated, service_role;
grant select, insert, update, delete, references, trigger on public.product_search_cache to service_role;
grant select, insert, update, delete, references, trigger on public.product_search_usage to service_role;

-- Atomically checks user day/month and site day limits (Sydney calendar), then
-- counts one live call. Returns 'ok', 'user_day', 'user_month' or 'site_day'.
create or replace function public.consume_search_quota(
  p_user uuid,
  p_day_limit integer,
  p_month_limit integer,
  p_site_limit integer
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  today date := (now() at time zone 'Australia/Sydney')::date;
  user_day integer;
  user_month integer;
  site_day integer;
begin
  perform pg_advisory_xact_lock(hashtext('consume_search_quota'));
  select coalesce(sum(calls), 0) into site_day from product_search_usage where day = today;
  select coalesce(sum(calls) filter (where day = today), 0),
         coalesce(sum(calls), 0)
    into user_day, user_month
    from product_search_usage
   where user_id = p_user and day >= date_trunc('month', today)::date;
  if user_day >= p_day_limit then return 'user_day'; end if;
  if user_month >= p_month_limit then return 'user_month'; end if;
  if site_day >= p_site_limit then return 'site_day'; end if;
  insert into product_search_usage (user_id, day, calls) values (p_user, today, 1)
  on conflict (user_id, day) do update set calls = product_search_usage.calls + 1;
  return 'ok';
end;
$$;

revoke all on function public.consume_search_quota(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_search_quota(uuid, integer, integer, integer) to service_role;
