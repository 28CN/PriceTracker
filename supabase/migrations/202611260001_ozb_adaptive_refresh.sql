-- Adaptive OzBargain refresh.
-- * ozb_refresh_state: one row. The /deals page notes visits; the fetch job
--   reads it to decide whether to run (hourly while people look, every ~3h otherwise).
-- * ozb_feed_status gets the validators for conditional GET (ETag / Last-Modified).
-- * note_deals_visit(): the only way the website writes here. Rate limited:
--   the visit time moves at most once a minute, and it asks for a fetch at
--   most once every 20 minutes, and only when the last run is 55+ minutes old.

create table if not exists public.ozb_refresh_state (
  id boolean primary key default true check (id),
  last_visit_at timestamptz,
  last_dispatch_at timestamptz,
  last_run_at timestamptz
);

insert into public.ozb_refresh_state (id) values (true) on conflict (id) do nothing;

alter table public.ozb_refresh_state enable row level security;

-- No policies: anon/authenticated cannot read or write the table directly.
revoke all on public.ozb_refresh_state from public, anon, authenticated, service_role;
grant select, insert, update on public.ozb_refresh_state to service_role;

alter table public.ozb_feed_status add column if not exists etag text;
alter table public.ozb_feed_status add column if not exists last_modified text;
alter table public.ozb_feed_status add column if not exists last_status integer;

-- Feed status stays publicly readable (last_ok_at drives "Updated ..."),
-- but only these columns, so validators are not exposed.
revoke all on public.ozb_feed_status from public, anon, authenticated;
grant select (shop, last_attempt_at, last_ok_at, item_count) on public.ozb_feed_status to anon, authenticated;

create or replace function public.note_deals_visit()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  state public.ozb_refresh_state%rowtype;
  want boolean := false;
begin
  select * into state from public.ozb_refresh_state where id for update;
  if not found then
    insert into public.ozb_refresh_state (id) values (true) on conflict (id) do nothing;
    select * into state from public.ozb_refresh_state where id for update;
  end if;

  want := (state.last_run_at is null or state.last_run_at < now() - interval '55 minutes')
      and (state.last_dispatch_at is null or state.last_dispatch_at < now() - interval '20 minutes');

  if want then
    update public.ozb_refresh_state
       set last_visit_at = now(), last_dispatch_at = now()
     where id;
  elsif state.last_visit_at is null or state.last_visit_at < now() - interval '1 minute' then
    update public.ozb_refresh_state set last_visit_at = now() where id;
  end if;

  return want;
end;
$$;

revoke all on function public.note_deals_visit() from public;
grant execute on function public.note_deals_visit() to anon, authenticated, service_role;
