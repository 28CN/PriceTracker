-- pgTAP: brand follow/mute preferences are private to each user.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);

select ok((select relrowsecurity from pg_class where oid = 'public.deal_brand_prefs'::regclass), 'RLS on deal_brand_prefs');
select ok(not has_table_privilege('anon', 'public.deal_brand_prefs', 'select'), 'anon cannot read brand prefs');
select ok(has_table_privilege('authenticated', 'public.deal_brand_prefs', 'select,insert,update,delete'), 'authenticated can manage (RLS filters rows)');
select ok(not has_table_privilege('authenticated', 'public.deal_brand_prefs', 'truncate'), 'no truncate');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'deal_brand_prefs' and permissive = 'RESTRICTIVE'),
  3, 'demo account cannot insert, update or delete');
select is(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'deal_brand_prefs' and policyname = 'users manage own brand prefs'),
  '(user_id = ( SELECT auth.uid() AS uid))', 'owners only');
select throws_ok(
  $$insert into public.deal_brand_prefs (user_id, brand_key, label, state) values (gen_random_uuid(), 'Bad-Key!', 'x', 'follow')$$,
  '23514', null, 'brand key must be normalised');
select throws_ok(
  $$insert into public.deal_brand_prefs (user_id, brand_key, label, state) values (gen_random_uuid(), 'lego', 'LEGO', 'love')$$,
  '23514', null, 'state is follow or mute');

select * from finish();
rollback;
