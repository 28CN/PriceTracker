-- pgTAP: OzBargain deals are readable by everyone and writable only by the job.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

select ok((select relrowsecurity from pg_class where oid = 'public.ozb_deals'::regclass), 'RLS on ozb_deals');
select ok((select relrowsecurity from pg_class where oid = 'public.ozb_feed_status'::regclass), 'RLS on ozb_feed_status');
select ok(has_table_privilege('anon', 'public.ozb_deals', 'select'), 'anon can read deals');
select ok(not has_table_privilege('anon', 'public.ozb_deals', 'insert'), 'anon cannot add deals');
select ok(not has_table_privilege('authenticated', 'public.ozb_deals', 'update'), 'signed-in users cannot change deals');
select ok(not has_table_privilege('authenticated', 'public.ozb_deals', 'delete'), 'signed-in users cannot delete deals');
select ok(not has_table_privilege('anon', 'public.ozb_feed_status', 'insert'), 'anon cannot write feed status');
select ok(has_table_privilege('service_role', 'public.ozb_deals', 'select,insert,update,delete'), 'service_role can write deals');

insert into public.ozb_deals (node_id, title, deal_url, shop, tab, posted_at)
values (1, 'Test deal $1 @ Coles', 'https://www.ozbargain.com.au/node/1', 'coles', 'shops', now());

set local role anon;
select is((select count(*)::int from public.ozb_deals where node_id = 1), 1, 'anon sees the deal');
reset role;

select throws_ok(
  $$insert into public.ozb_deals (node_id, title, deal_url, shop, tab, posted_at)
    values (2, 'x', 'https://evil.example/node/2', 'coles', 'shops', now())$$,
  '23514', null, 'deal links must point at an OzBargain deal page');

select * from finish();
rollback;
