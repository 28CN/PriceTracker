-- pgTAP: retailer_promo_cycles shape, RLS, grants; and no TRUNCATE anywhere.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

select has_table('public', 'retailer_promo_cycles', 'retailer_promo_cycles exists');
select ok((select relrowsecurity from pg_class where oid = 'public.retailer_promo_cycles'::regclass), 'RLS enabled');
select is((select count(*)::int from public.retailer_promo_cycles where lower(retailer) in ('coles','woolworths') and anchor_weekday = 3 and cycle_days = 7), 2, 'Coles/Woolworths seeded Wed/7');
select throws_ok($$ insert into public.retailer_promo_cycles (retailer, anchor_weekday, cycle_days) values ('COLES ', 3, 7) $$, '23505', null, 'retailer is unique case-insensitively');
select ok(has_table_privilege('anon', 'public.retailer_promo_cycles', 'select'), 'anon can read');
select ok(not has_table_privilege('anon', 'public.retailer_promo_cycles', 'insert,update,delete'), 'anon cannot write');
select ok(not has_table_privilege('authenticated', 'public.retailer_promo_cycles', 'insert,update,delete'), 'authenticated cannot write');

set local role anon;
select isnt_empty($$ select 1 from public.retailer_promo_cycles $$, 'anon sees rows through RLS');
reset role;

-- Covers tables created by any role (incl. supabase_admin default ACLs).
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   cross join (values ('anon'), ('authenticated'), ('service_role')) r(role)
   where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')
     and has_table_privilege(r.role, c.oid, 'TRUNCATE')),
  0, 'no public table/view grants TRUNCATE to anon/authenticated/service_role');
select ok(not has_table_privilege('service_role', 'public.retailer_promo_cycles', 'truncate'), 'service_role no TRUNCATE on promo cycles');

select * from finish();
rollback;
