-- PR5: read-only demo account.
-- * profiles.is_demo flags demo users; anon/authenticated callers cannot change it.
-- * RESTRICTIVE RLS policies deny INSERT/UPDATE/DELETE on every user-writable
--   table when the caller is a demo user (the API layer also returns 403).
-- * Seeds a demo user ("demo") with a few public products copied from existing
--   public products. Insert-only: no existing row is changed or deleted.
-- * The demo user's password is NOT set here. It is set out-of-band and kept in
--   the DEMO_ACCOUNT_PASSWORD env var on Vercel. Until then the account has a
--   random unusable password.
-- Idempotent: safe to re-apply.

alter table public.profiles
  add column if not exists is_demo boolean not null default false;

create or replace function public.is_demo_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_demo from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

revoke all on function public.is_demo_user() from public;
grant execute on function public.is_demo_user() to anon, authenticated, service_role;

create or replace function public.protect_profile_demo_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only API callers (anon/authenticated) are restricted; migrations and the
  -- service role may set the flag.
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and new.is_demo then
      raise exception 'is_demo can only be set by the server';
    elsif tg_op = 'UPDATE' and new.is_demo is distinct from old.is_demo then
      raise exception 'is_demo can only be changed by the server';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_demo_flag on public.profiles;
create trigger profiles_protect_demo_flag
before insert or update on public.profiles
for each row execute function public.protect_profile_demo_flag();

-- Restrictive "demo users cannot write" policies.
do $$
declare
  t text;
  op text;
begin
  foreach t in array array[
    'account_private', 'categories', 'crawl_events', 'notification_preferences',
    'price_history', 'privacy_consents', 'products', 'profiles', 'tracked_links',
    'user_preferences'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    foreach op in array array['insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', 'demo users cannot ' || op, t);
      if op = 'insert' then
        execute format(
          'create policy %I on public.%I as restrictive for insert to authenticated with check (not (select public.is_demo_user()))',
          'demo users cannot ' || op, t);
      else
        execute format(
          'create policy %I on public.%I as restrictive for %s to authenticated using (not (select public.is_demo_user()))',
          'demo users cannot ' || op, t, op);
      end if;
    end loop;
  end loop;
end;
$$;

-- Seed the demo user and its data.
do $$
declare
  demo_id constant uuid := 'd3300000-0000-4000-8000-00000000de30';
  src record;
  new_category uuid;
  new_product uuid;
  new_link uuid;
  l record;
begin
  if not exists (select 1 from auth.users where id = demo_id) then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', demo_id, 'authenticated', 'authenticated',
      'demo@users.invalid',
      extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"username":"demo","display_name":"Demo (read-only)"}'::jsonb,
      now(), now(), '', '', '', ''
    );

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), demo_id::text, demo_id,
      jsonb_build_object('sub', demo_id::text, 'email', 'demo@users.invalid', 'email_verified', true),
      'email', now(), now(), now()
    );
  end if;

  -- Companion rows normally come from the on_auth_user_created trigger.
  insert into public.profiles (id, username, display_name)
  values (demo_id, 'demo', 'Demo (read-only)')
  on conflict (id) do nothing;
  insert into public.account_private (user_id, auth_email)
  values (demo_id, 'demo@users.invalid')
  on conflict (user_id) do nothing;
  insert into public.user_security (user_id) values (demo_id) on conflict (user_id) do nothing;
  insert into public.user_roles (user_id, role) values (demo_id, 'user') on conflict do nothing;
  insert into public.notification_preferences (user_id) values (demo_id) on conflict (user_id) do nothing;

  -- Only touches the demo user's own profile row.
  update public.profiles
  set is_demo = true,
      public_slug = coalesce(public_slug, 'demo'),
      watchlist_visibility = 'public'
  where id = demo_id
    and (is_demo is distinct from true or watchlist_visibility <> 'public' or public_slug is null);

  if exists (select 1 from public.products where owner_id = demo_id) then
    return;
  end if;

  -- Copy up to 4 public products that already have price history.
  for src in
    select p.id, p.name, p.image_url, p.target_price, c.name as category_name
    from public.products p
    join public.profiles o on o.id = p.owner_id and o.watchlist_visibility = 'public' and not o.is_demo
    left join public.categories c on c.id = p.category_id
    where (c.id is null or c.is_public)
      and exists (
        select 1 from public.tracked_links tl
        join public.price_history h on h.link_id = tl.id
        where tl.product_id = p.id
      )
    order by (
      select count(*) from public.tracked_links tl
      join public.price_history h on h.link_id = tl.id
      where tl.product_id = p.id
    ) desc
    limit 4
  loop
    new_category := null;
    if src.category_name is not null then
      select id into new_category from public.categories
      where owner_id = demo_id and name = src.category_name;
      if new_category is null then
        insert into public.categories (name, owner_id, is_public)
        values (src.category_name, demo_id, true)
        returning id into new_category;
      end if;
    end if;

    insert into public.products (name, image_url, target_price, owner_id, category_id)
    values (src.name, src.image_url, src.target_price, demo_id, new_category)
    returning id into new_product;

    for l in
      select * from public.tracked_links where product_id = src.id
    loop
      insert into public.tracked_links (
        product_id, url, retailer, is_active, image_url, image_candidates,
        stock_status, stock_checked_at, created_at
      ) values (
        new_product, l.url, l.retailer, l.is_active, l.image_url, l.image_candidates,
        l.stock_status, l.stock_checked_at, l.created_at
      )
      returning id into new_link;

      insert into public.price_history (link_id, price, created_at)
      select new_link, h.price, h.created_at
      from public.price_history h
      where h.link_id = l.id;
    end loop;
  end loop;
end;
$$;
