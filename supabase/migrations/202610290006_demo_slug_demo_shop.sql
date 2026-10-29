-- Rename the demo account's username and public slug from 'demo' to
-- 'demo-shop' so its public page (/demo-shop) no longer collides with the
-- /demo sign-in route. Update only; nothing is deleted.
do $$
declare
  demo_id constant uuid := 'd3300000-0000-4000-8000-00000000de30';
begin
  if exists (
    select 1 from public.profiles
    where id <> demo_id and (public_slug = 'demo-shop' or username = 'demo-shop')
  ) then
    raise exception 'demo-shop is already taken by another profile';
  end if;

  -- protect_profile_identity() only lets service_role change usernames.
  -- Claim that role for this transaction only (is_local = true).
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- protect_profile_identity() only lets service_role change usernames.
  -- Act as service_role for this transaction only.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);

  update public.profiles
     set username = 'demo-shop', public_slug = 'demo-shop'
   where id = demo_id
     and (username is distinct from 'demo-shop' or public_slug is distinct from 'demo-shop');

  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"username":"demo-shop"}'::jsonb
   where id = demo_id
     and coalesce(raw_user_meta_data->>'username', '') <> 'demo-shop';

  perform set_config('request.jwt.claim.role', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
