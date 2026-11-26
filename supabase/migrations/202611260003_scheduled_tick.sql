-- Hourly scheduler in the database. GitHub delays or skips scheduled runs on
-- this repo by hours, so pg_cron calls the site at :00 every hour and the site
-- starts whichever GitHub workflow is due. The bearer secret lives in Vault
-- (name 'pricetracker_cron_secret') and in the site's env, never in this repo.
-- Without the Vault secret (e.g. a local database) the tick does nothing.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- When each scheduled job was last started, so retries never double-start it.
create table if not exists public.scheduled_tasks (
  task text primary key check (task in ('prices')),
  last_dispatch_at timestamptz
);

insert into public.scheduled_tasks (task) values ('prices') on conflict (task) do nothing;

alter table public.scheduled_tasks enable row level security;
revoke all on public.scheduled_tasks from public, anon, authenticated, service_role;
grant select on public.scheduled_tasks to service_role;

-- What is due now, claimed atomically:
--   deals:  same rule as crawler/deals.py should_run('schedule'), plus the
--           20-minute gap shared with visit-triggered dispatches.
--   prices: Monday and Thursday 03:00 UTC (retried until 05:00 if a dispatch
--           failed), at most once per 20 hours.
create or replace function public.claim_scheduled_work(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  state public.ozb_refresh_state%rowtype;
  utc timestamp := p_now at time zone 'UTC';
  deals boolean := false;
  prices boolean := false;
begin
  select * into state from public.ozb_refresh_state where id for update;
  if found then
    deals := (state.last_dispatch_at is null or state.last_dispatch_at < p_now - interval '20 minutes')
      and (
        state.last_run_at is null
        or state.last_run_at <= p_now - interval '170 minutes'
        or (state.last_visit_at >= p_now - interval '65 minutes' and state.last_run_at <= p_now - interval '55 minutes')
      );
    if deals then
      update public.ozb_refresh_state set last_dispatch_at = p_now where id;
    end if;
  end if;

  if extract(isodow from utc) in (1, 4) and extract(hour from utc) between 3 and 5 then
    update public.scheduled_tasks
       set last_dispatch_at = p_now
     where task = 'prices'
       and (last_dispatch_at is null or last_dispatch_at < p_now - interval '20 hours');
    prices := found;
  end if;

  return jsonb_build_object('deals', deals, 'prices', prices, 'at', p_now);
end;
$$;

-- Undo a price claim when GitHub refused the dispatch, so the next hour retries.
create or replace function public.release_scheduled_task(p_task text, p_claimed_at timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.scheduled_tasks set last_dispatch_at = null
   where task = p_task and last_dispatch_at = p_claimed_at;
$$;

revoke all on function public.claim_scheduled_work(timestamptz) from public, anon, authenticated;
revoke all on function public.release_scheduled_task(text, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_scheduled_work(timestamptz) to service_role;
grant execute on function public.release_scheduled_task(text, timestamptz) to service_role;

-- The tick itself: one POST to the site with the Vault secret.
create or replace function public.scheduled_tick()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'pricetracker_cron_secret';
  if secret is null or secret = '' then
    return null;
  end if;
  return net.http_post(
    url := 'https://pricetracker-au.vercel.app/api/internal/scheduled',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 20000
  );
end;
$$;

revoke all on function public.scheduled_tick() from public, anon, authenticated, service_role;

select cron.schedule('pricetracker-hourly', '0 * * * *', 'select public.scheduled_tick()');
