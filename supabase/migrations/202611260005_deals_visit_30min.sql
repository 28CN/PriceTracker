-- Opening Deals asks for a fresh fetch when the last one is 30+ minutes old
-- (was 55). Still at most one ask per 20 minutes; the crawler keeps its
-- 2-second gaps and conditional GET, so OzBargain sees at most ~14 small
-- requests per half hour, and only while someone is looking.
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

  want := (state.last_run_at is null or state.last_run_at < now() - interval '30 minutes')
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
