begin;
select plan(8);

select ok(has_table_privilege('service_role', 'public.price_history', 'select,insert,update,delete'), 'service_role full DML on price_history');
select ok(has_table_privilege('service_role', 'public.crawl_jobs', 'select,insert,update,delete'), 'service_role full DML on crawl_jobs');
select ok(has_table_privilege('anon', 'public.products', 'select'), 'anon can select products (RLS filters rows)');
select ok(has_table_privilege('authenticated', 'public.tracked_links', 'insert'), 'authenticated can insert tracked_links');
select ok(not has_table_privilege('anon', 'public.price_history', 'truncate'), 'anon cannot truncate price_history');
select ok(not has_table_privilege('anon', 'public.profiles', 'update'), 'anon cannot update profiles');
select ok(not has_table_privilege('authenticated', 'public.email_outbox', 'select'), 'authenticated has no access to email_outbox');
select ok(not has_table_privilege('authenticated', 'public.price_history', 'delete'), 'authenticated cannot delete price_history');

select * from finish();
rollback;
