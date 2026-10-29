-- pgTAP: public.price_link_stats is read-only and respects RLS.
-- Runs in one transaction that is rolled back; no data is kept.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

-- ---------------------------------------------------------------- fixtures
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '31111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
   'pi-alice@users.invalid', '{"username":"pi-alice"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '32222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
   'pi-bob@users.invalid', '{"username":"pi-bob"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated',
   'pi-carol@users.invalid', '{"username":"pi-carol"}', now(), now());

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.profiles set watchlist_visibility = 'public'
where id = '33333333-3333-4333-8333-333333333333';

insert into public.products (id, name, owner_id) values
  ('3aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Alice private', '31111111-1111-4111-8111-111111111111'),
  ('3ccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Carol public', '33333333-3333-4333-8333-333333333333');
insert into public.tracked_links (id, product_id, retailer, url) values
  ('3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '3aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Shop', 'https://shop.example/a'),
  ('3ddddddd-dddd-4ddd-8ddd-dddddddddddd', '3ccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Shop', 'https://shop.example/c');

-- Alice: 100 (100d ago), 90 (60d), 120 (20d), 120 (10d), 110 (now).
insert into public.price_history (link_id, price, created_at) values
  ('3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 100, now() - interval '100 days'),
  ('3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',  90, now() - interval '60 days'),
  ('3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 120, now() - interval '20 days'),
  ('3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 120, now() - interval '10 days'),
  ('3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 110, now() - interval '1 minute'),
  ('3ddddddd-dddd-4ddd-8ddd-dddddddddddd',  50, now() - interval '1 minute');

-- ------------------------------------------------------------- definition
select has_view('public', 'price_link_stats', 'price_link_stats view exists');
select ok(
  (select 'security_invoker=true' = any(reloptions) from pg_class where oid = 'public.price_link_stats'::regclass),
  'price_link_stats runs with security_invoker'
);
select ok(not has_table_privilege('anon', 'public.price_link_stats', 'select'), 'anon cannot select the view');
select ok(has_table_privilege('authenticated', 'public.price_link_stats', 'select'), 'authenticated can select the view');

-- ------------------------------------------------------------- owner view
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"31111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select results_eq(
  $$ select current_price, all_time_low, low_30d, high_30d, low_90d, high_90d, sample_count, sample_count_90d
     from public.price_link_stats where link_id = '3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
  $$ values (110::numeric, 90::numeric, 110::numeric, 120::numeric, 90::numeric, 120::numeric, 5, 4) $$,
  'owner sees correct stats for own link'
);
select is(
  (select avg_90d from public.price_link_stats where link_id = '3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  110.00::numeric,
  'avg_90d is the mean of in-window samples'
);
select ok(
  (select last_change_at > now() - interval '1 hour' from public.price_link_stats
   where link_id = '3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'last_change_at is the latest price change (120 -> 110), not the repeat at 120'
);
select ok(
  (select all_time_low_at < now() - interval '59 days' from public.price_link_stats
   where link_id = '3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'all_time_low_at points at the 90 sample'
);

-- --------------------------------------------------------------- other user
select set_config('request.jwt.claims', '{"sub":"32222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

select is_empty(
  $$ select 1 from public.price_link_stats where product_id = '3aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  'RLS: another user cannot see stats for a private product'
);
select is(
  (select current_price from public.price_link_stats where product_id = '3ccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  50::numeric,
  'RLS: stats for a public watchlist product are visible to others'
);
select throws_ok(
  $$ update public.price_link_stats set current_price = 1 $$,
  null,
  null,
  'the view is not writable'
);

-- -------------------------------------------------------------------- anon
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select 1 from public.price_link_stats $$,
  '42501',
  null,
  'anon is denied the view'
);

-- ------------------------------------------------- price_history untouched
reset role;
select is(
  (select count(*)::int from public.price_history
   where link_id in ('3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '3ddddddd-dddd-4ddd-8ddd-dddddddddddd')),
  6,
  'price_history rows are unchanged by reading the view'
);
select is(
  (select count(*)::int from public.price_link_stats where product_id = '3aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  1,
  'without RLS (table owner) the private stats row exists, one row per link'
);

select * from finish();
rollback;
