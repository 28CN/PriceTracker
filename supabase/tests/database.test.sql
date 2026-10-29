-- pgTAP tests for key database behaviour. Run with: supabase test db
-- Everything runs in one transaction that is rolled back, so no data is kept.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

-- ---------------------------------------------------------------- fixtures
-- Two normal users (the on_auth_user_created trigger creates their profile,
-- account_private and notification_preferences rows).
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
   'alice@users.invalid', '{"username":"alice-test"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
   'bob@users.invalid', '{"username":"bob-test"}', now(), now());

-- Protected-field triggers only let the server (service_role claim) set these.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Alice wants target-price emails and has a verified contact address.
update public.account_private
set contact_email = 'alice@example.com', contact_email_verified_at = now()
where user_id = '11111111-1111-4111-8111-111111111111';
update public.notification_preferences
set target_price_email = true
where user_id = '11111111-1111-4111-8111-111111111111';

insert into public.products (id, name, target_price, owner_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Test product', 50, '11111111-1111-4111-8111-111111111111');
insert into public.tracked_links (id, product_id, retailer, url)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Test', 'https://shop.example/p');

-- ------------------------------------------------------------ email gate
select is(
  (select value from public.app_settings where key = 'email_enabled'),
  'false'::jsonb,
  'email_enabled setting exists and defaults to false'
);
select is(public.email_enabled(), false, 'email_enabled() is false by default');
select has_trigger('public', 'email_outbox', 'email_outbox_00_email_enabled_gate', 'gate trigger exists on email_outbox');

-- Price drops below target while email is off.
-- created_at is set explicitly: now() is fixed inside one transaction.
insert into public.price_history (link_id, price, created_at) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 40, now() - interval '3 minutes');

select is(
  (select episode from public.price_alert_states where product_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  1,
  'email off: alert episode still advances'
);
select is(
  (select is_below_target from public.price_alert_states where product_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  true,
  'email off: alert state still marked below target'
);
select is(
  (select count(*)::int from public.email_outbox where product_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  0,
  'email off: target-price alert does not reach the outbox'
);

insert into public.email_outbox (kind, recipient, dedupe_key)
values ('account_notice', 'x@example.com', 'pgtap:direct-off');
select is(
  (select count(*)::int from public.email_outbox where dedupe_key = 'pgtap:direct-off'),
  0,
  'email off: a direct outbox insert is dropped'
);

-- Turn email on inside this transaction only.
update public.app_settings set value = 'true'::jsonb where key = 'email_enabled';

insert into public.price_history (link_id, price, created_at) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 60, now() - interval '2 minutes'); -- back above target
insert into public.price_history (link_id, price, created_at) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 45, now() - interval '1 minute'); -- below again

select is(
  (select episode from public.price_alert_states where product_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  2,
  'email on: a new episode starts after the price recovers and drops again'
);
select is(
  (select count(*)::int from public.email_outbox
   where product_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and kind = 'target_price'),
  1,
  'email on: the target-price alert is queued'
);

update public.app_settings set value = 'false'::jsonb where key = 'email_enabled';

-- ------------------------------------------- definer function privileges
select ok(not has_function_privilege('anon', 'public.email_enabled()', 'execute'), 'anon cannot run email_enabled()');
select ok(not has_function_privilege('authenticated', 'public.email_enabled()', 'execute'), 'authenticated cannot run email_enabled()');
select ok(has_function_privilege('service_role', 'public.email_enabled()', 'execute'), 'service_role can run email_enabled()');
select ok(not has_function_privilege('authenticated', 'public.email_outbox_insert_gate()', 'execute'), 'authenticated cannot run email_outbox_insert_gate()');
select ok(not has_function_privilege('anon', 'public.claim_email_outbox(integer)', 'execute'), 'anon cannot claim the email outbox');
select ok(not has_function_privilege('authenticated', 'public.claim_email_outbox(integer)', 'execute'), 'authenticated cannot claim the email outbox');
select ok(not has_function_privilege('authenticated', 'public.claim_crawl_jobs(text)', 'execute'), 'authenticated cannot claim crawl jobs');

-- No SECURITY DEFINER function in public may be runnable by PUBLIC.
select is_empty(
  $$ select p.proname from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prosecdef
       and has_function_privilege('public', p.oid, 'execute') $$,
  'no public SECURITY DEFINER function is executable by PUBLIC'
);

-- --------------------------------------------------------------------- RLS
select is_empty(
  $$ select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity $$,
  'every public table has RLS enabled'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

select is_empty(
  $$ select 1 from public.account_private where user_id = '11111111-1111-4111-8111-111111111111' $$,
  'RLS: a user cannot read another user''s private account row'
);
select is_empty(
  $$ select 1 from public.email_outbox $$,
  'RLS: authenticated users cannot read the email outbox'
);
select is_empty(
  $$ select 1 from public.app_settings $$,
  'RLS: authenticated users cannot read app_settings'
);
select throws_ok(
  $$ insert into public.products (name, owner_id) values ('Not mine', '11111111-1111-4111-8111-111111111111') $$,
  '42501',
  null,
  'RLS: a user cannot create a product owned by someone else'
);

-- --------------------------------------------------------- demo read-only
select set_config('request.jwt.claims', '{"sub":"d3300000-0000-4000-8000-00000000de30","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.products (name, owner_id) values ('Demo write', 'd3300000-0000-4000-8000-00000000de30') $$,
  '42501',
  null,
  'demo user cannot insert products'
);
-- The restrictive policy hides the row from UPDATE (0 rows) and the trigger
-- would reject a flag change anyway; either way the flag must stay set.
do $$
begin
  update public.profiles set is_demo = false where id = 'd3300000-0000-4000-8000-00000000de30';
exception when others then
  null;
end;
$$;

reset role;

select is(
  (select is_demo from public.profiles where id = 'd3300000-0000-4000-8000-00000000de30'),
  true,
  'demo user cannot clear its demo flag'
);

select * from finish();
rollback;
