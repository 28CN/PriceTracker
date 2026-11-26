-- pgTAP: the hourly scheduler claims work once and is closed to clients.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

select ok((select relrowsecurity from pg_class where oid = 'public.scheduled_tasks'::regclass), 'RLS on scheduled_tasks');
select ok(not has_table_privilege('anon', 'public.scheduled_tasks', 'select'), 'anon cannot read scheduled_tasks');
select ok(not has_table_privilege('authenticated', 'public.scheduled_tasks', 'select'), 'authenticated cannot read scheduled_tasks');
select ok(not has_function_privilege('anon', 'public.claim_scheduled_work(timestamptz)', 'execute'), 'anon cannot claim work');
select ok(not has_function_privilege('authenticated', 'public.scheduled_tick()', 'execute'), 'clients cannot fire the tick');
select is(
  (select count(*)::int from cron.job where jobname = 'pricetracker-hourly' and schedule = '0 * * * *'),
  1, 'hourly job scheduled at :00');

-- No Vault secret here, so the tick sends nothing.
select is(public.scheduled_tick(), null::bigint, 'tick is a no-op without the secret');

-- Deals: due after 170 quiet minutes, then not again within 20 minutes.
update public.ozb_refresh_state set last_run_at = '2026-11-30 00:00+00', last_visit_at = null, last_dispatch_at = null where id;
select is((public.claim_scheduled_work('2026-11-30 01:00+00') ->> 'deals')::boolean, false, 'deals not due an hour after a quiet fetch');
select is((public.claim_scheduled_work('2026-11-30 03:00+00') ->> 'deals')::boolean, true, 'deals due after ~3 quiet hours');
select is((public.claim_scheduled_work('2026-11-30 03:10+00') ->> 'deals')::boolean, false, 'no second deals claim within 20 minutes');

-- Prices: Monday 03:00 UTC once; never on a Tuesday.
update public.scheduled_tasks set last_dispatch_at = null where task = 'prices';
select is(
  array[(public.claim_scheduled_work('2026-11-30 03:00+00') ->> 'prices')::boolean,
        (public.claim_scheduled_work('2026-11-30 04:00+00') ->> 'prices')::boolean],
  array[true, false], 'Monday crawl claimed once');
select is((public.claim_scheduled_work('2026-12-01 03:00+00') ->> 'prices')::boolean, false, 'no crawl on Tuesday');

select * from finish();
rollback;
