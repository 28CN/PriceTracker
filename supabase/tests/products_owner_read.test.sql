-- Normal users can INSERT ... RETURNING their own product; others cannot read it.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(3);

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated',
   'carol@users.invalid', '{"username":"carol-test"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated',
   'dave@users.invalid', '{"username":"dave-test"}', now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.products (name, owner_id) values ('carol-own', '33333333-3333-4333-8333-333333333333') returning id $$,
  'normal user INSERT ... RETURNING on own product succeeds');
select isnt_empty($$ select 1 from public.products where name = 'carol-own' $$, 'owner can read own product');

select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
select is_empty($$ select 1 from public.products where name = 'carol-own' $$, 'another user cannot read it');

select * from finish();
rollback;
