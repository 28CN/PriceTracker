-- pgTAP: search cache/usage are server-only; quota function enforces limits.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);

select ok((select relrowsecurity from pg_class where oid = 'public.product_search_cache'::regclass), 'cache RLS on');
select ok((select relrowsecurity from pg_class where oid = 'public.product_search_usage'::regclass), 'usage RLS on');
select ok(not has_table_privilege('anon', 'public.product_search_cache', 'select,insert,update,delete'), 'anon no cache access');
select ok(not has_table_privilege('authenticated', 'public.product_search_usage', 'select,insert,update,delete'), 'authenticated no usage access');
select ok(not has_table_privilege('service_role', 'public.product_search_cache', 'truncate'), 'service_role no TRUNCATE');
select ok(not has_function_privilege('authenticated', 'public.consume_search_quota(uuid,integer,integer,integer)', 'execute'), 'clients cannot call quota fn');

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000a5a5', 'authenticated', 'authenticated',
  'quota-test@users.invalid', '{"username":"quota-test"}', now(), now());
select is(public.consume_search_quota('00000000-0000-0000-0000-00000000a5a5', 1, 30, 1000), 'ok', 'first call allowed');
select is(public.consume_search_quota('00000000-0000-0000-0000-00000000a5a5', 1, 30, 1000), 'user_day', 'daily cap hit');
select is(public.consume_search_quota('00000000-0000-0000-0000-00000000a5a5', 5, 30, 0), 'site_day', 'site cap hit');

select * from finish();
rollback;
