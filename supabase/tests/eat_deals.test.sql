-- pgTAP: fast-food deals for /eat. Public can read deals; validators and the
-- refresh clock stay private; a visit can only ask for a fetch (rate limited).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(11);

select ok((select relrowsecurity from pg_class where oid = 'public.eat_deals'::regclass), 'RLS on eat_deals');
select ok((select relrowsecurity from pg_class where oid = 'public.eat_feed_status'::regclass), 'RLS on eat_feed_status');
select ok(has_table_privilege('anon', 'public.eat_deals', 'select'), 'anon can read eat deals');
select ok(not has_table_privilege('anon', 'public.eat_deals', 'insert'), 'anon cannot add eat deals');
select ok(not has_table_privilege('authenticated', 'public.eat_deals', 'truncate'), 'nobody signed in can truncate');
select ok(has_column_privilege('anon', 'public.eat_feed_status', 'last_ok_at', 'select'), 'anon can read when food feeds last worked');
select ok(not has_column_privilege('anon', 'public.eat_feed_status', 'etag', 'select'), 'anon cannot read food feed validators');
select ok((select prosecdef from pg_proc where oid = 'public.note_eat_visit()'::regprocedure), 'note_eat_visit is security definer');

update public.ozb_refresh_state set food_last_run_at = now() - interval '2 hours', food_last_dispatch_at = null, food_last_visit_at = null;
set local role anon;
select is(public.note_eat_visit(), true, 'a visit asks for the food feeds when the last fetch is old');
select is(public.note_eat_visit(), false, 'a second visit right after does not ask again');
reset role;

update public.ozb_refresh_state set food_last_run_at = now() - interval '10 minutes', food_last_dispatch_at = null;
set local role authenticated;
select is(public.note_eat_visit(), false, 'no ask when the food feeds were fetched recently');
reset role;

select * from finish();
rollback;
