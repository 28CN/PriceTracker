-- pgTAP: explicit table grants exist (positive checks only; local default
-- privileges may still grant more, which RLS governs).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(4);

select ok(has_table_privilege('service_role', 'public.price_history', 'select,insert,update,delete'), 'service_role full DML on price_history');
select ok(has_table_privilege('service_role', 'public.crawl_jobs', 'select,insert,update,delete'), 'service_role full DML on crawl_jobs');
select ok(has_table_privilege('anon', 'public.products', 'select'), 'anon can select products (RLS filters rows)');
select ok(has_table_privilege('authenticated', 'public.tracked_links', 'insert'), 'authenticated can insert tracked_links');

select * from finish();
rollback;
