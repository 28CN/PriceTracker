-- claim_scheduled_work: with no recent visit last_visit_at is null, which made
-- the deals answer null instead of false. Same rule, never null.
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
    deals := coalesce(
      (state.last_dispatch_at is null or state.last_dispatch_at < p_now - interval '20 minutes')
      and (
        state.last_run_at is null
        or state.last_run_at <= p_now - interval '170 minutes'
        or (state.last_visit_at >= p_now - interval '65 minutes' and state.last_run_at <= p_now - interval '55 minutes')
      ),
      false
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
