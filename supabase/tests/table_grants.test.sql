-- pgTAP: explicit table grants exist (positive checks only; local default
-- privileges may still grant more, which RLS governs).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(5);

select ok(has_table_privilege('service_role', 'public.price_history', 'select,insert,update,delete'), 'service_role full DML on price_history');
select ok(has_table_privilege('service_role', 'public.crawl_jobs', 'select,insert,update,delete'), 'service_role full DML on crawl_jobs');
select ok(has_table_privilege('anon', 'public.products', 'select'), 'anon can select products (RLS filters rows)');
select ok(has_table_privilege('authenticated', 'public.tracked_links', 'insert'), 'authenticated can insert tracked_links');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')
     and has_table_privilege('service_role', c.oid, 'TRUNCATE')),
  0, 'service_role has no TRUNCATE on any public relation');

select * from finish();
rollback;
