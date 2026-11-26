-- pgTAP: adaptive deals refresh. The site can only note a visit (rate limited);
-- the refresh state and feed validators stay private.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

select ok((select relrowsecurity from pg_class where oid = 'public.ozb_refresh_state'::regclass), 'RLS on ozb_refresh_state');
select ok(not has_table_privilege('anon', 'public.ozb_refresh_state', 'select'), 'anon cannot read refresh state');
select ok(not has_table_privilege('authenticated', 'public.ozb_refresh_state', 'update'), 'signed-in users cannot change refresh state');
select ok(has_table_privilege('service_role', 'public.ozb_refresh_state', 'select,update'), 'the job can read and update refresh state');
select ok(has_column_privilege('anon', 'public.ozb_feed_status', 'last_ok_at', 'select'), 'anon can read when feeds last worked');
select ok(not has_column_privilege('anon', 'public.ozb_feed_status', 'etag', 'select'), 'anon cannot read feed validators');
select ok((select prosecdef from pg_proc where oid = 'public.note_deals_visit()'::regprocedure), 'note_deals_visit is security definer');

update public.ozb_refresh_state set last_run_at = now() - interval '2 hours', last_dispatch_at = null, last_visit_at = null;

set local role anon;
select is(public.note_deals_visit(), true, 'a visit asks for a fetch when the last run is old');
select is(public.note_deals_visit(), false, 'a second visit right after does not ask again');
reset role;

update public.ozb_refresh_state set last_run_at = now() - interval '10 minutes', last_dispatch_at = null;
set local role authenticated;
select is(public.note_deals_visit(), false, 'no fetch when the last run is recent');
reset role;
select ok((select last_visit_at > now() - interval '1 minute' from public.ozb_refresh_state), 'the visit time is recorded');

update public.ozb_refresh_state set last_run_at = now() - interval '35 minutes', last_dispatch_at = null;
set local role anon;
select is(public.note_deals_visit(), true, 'a visit asks again once the last run is 30+ minutes old');
reset role;

select * from finish();
rollback;
