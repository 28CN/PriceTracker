-- PriceTracker multi-user foundation.
-- Run once in Supabase SQL Editor before deploying the authentication build.
-- This migration is intentionally idempotent where PostgreSQL allows it.

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text,
  bio text,
  avatar_path text,
  watchlist_visibility text not null default 'private'
    check (watchlist_visibility in ('private', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (
    username = lower(username)
    and username ~ '^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$'
  ),
  constraint profiles_display_name_length check (
    display_name is null or char_length(display_name) between 1 and 60
  ),
  constraint profiles_bio_length check (
    bio is null or char_length(bio) <= 280
  )
);

create unique index if not exists profiles_username_key
  on public.profiles (lower(username));

create table if not exists public.account_private (
  user_id uuid primary key references auth.users(id) on delete cascade,
  auth_email text not null unique,
  contact_email text,
  contact_email_verified_at timestamptz,
  phone_e164 text,
  phone_country text,
  phone_verified_at timestamptz,
  allow_product_improvement boolean not null default false,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_private_phone_format check (
    phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
  )
);

create unique index if not exists account_private_contact_email_key
  on public.account_private (lower(contact_email))
  where contact_email is not null;

create table if not exists public.user_security (
  user_id uuid primary key references auth.users(id) on delete cascade,
  must_change_password boolean not null default false,
  disabled_at timestamptz,
  last_password_change_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'user')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  target_price_email boolean not null default false,
  popular_deals_email boolean not null default false,
  personalised_recommendations_email boolean not null default false,
  digest_frequency text not null default 'instant'
    check (digest_frequency in ('instant', 'daily', 'weekly')),
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text not null default 'Australia/Sydney',
  updated_at timestamptz not null default now()
);

create table if not exists public.privacy_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_type text not null check (
    consent_type in (
      'target_price_email',
      'popular_deals_email',
      'personalised_recommendations',
      'product_improvement'
    )
  ),
  granted boolean not null,
  policy_version text not null,
  source text not null default 'account',
  created_at timestamptz not null default now()
);

create index if not exists privacy_consents_user_created_idx
  on public.privacy_consents (user_id, created_at desc);

create table if not exists public.user_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table if not exists public.email_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  purpose text not null check (purpose in ('verify_contact', 'recover_password', 'unsubscribe')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_verification_tokens_lookup_idx
  on public.email_verification_tokens (token_hash, purpose, expires_at)
  where consumed_at is null;

create table if not exists public.price_alert_states (
  product_id uuid primary key references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_below_target boolean not null default false,
  episode integer not null default 0,
  last_price numeric,
  last_retailer text,
  evaluated_at timestamptz not null default now()
);

create index if not exists price_alert_states_user_idx
  on public.price_alert_states (user_id);

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  kind text not null check (
    kind in ('target_price', 'verify_contact', 'recover_password', 'account_notice')
  ),
  recipient text not null,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'retry', 'failed', 'cancelled')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists email_outbox_pending_idx
  on public.email_outbox (status, next_attempt_at, created_at)
  where status in ('pending', 'retry');

create table if not exists public.email_delivery_events (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid references public.email_outbox(id) on delete set null,
  provider_message_id text,
  event_type text not null,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.auth_rate_limits (
  key_hash text not null,
  action text not null,
  attempts integer not null default 1,
  window_started_at timestamptz not null default now(),
  primary key (key_hash, action)
);

alter table public.products
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

alter table public.categories
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

create index if not exists products_owner_id_idx on public.products(owner_id);
create index if not exists categories_owner_id_idx on public.categories(owner_id);

drop index if exists public.categories_name_key;
create unique index if not exists categories_owner_name_key
  on public.categories (owner_id, lower(name))
  where owner_id is not null;
create unique index if not exists categories_legacy_name_key
  on public.categories (lower(name))
  where owner_id is null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists account_private_set_updated_at on public.account_private;
create trigger account_private_set_updated_at
before update on public.account_private
for each row execute function public.set_updated_at();

drop trigger if exists user_security_set_updated_at on public.user_security;
create trigger user_security_set_updated_at
before update on public.user_security
for each row execute function public.set_updated_at();

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute function public.set_updated_at();

create or replace function public.protect_private_account_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and (
    new.auth_email is distinct from old.auth_email
    or new.contact_email is distinct from old.contact_email
    or new.contact_email_verified_at is distinct from old.contact_email_verified_at
    or new.phone_e164 is distinct from old.phone_e164
    or new.phone_country is distinct from old.phone_country
    or new.phone_verified_at is distinct from old.phone_verified_at
    or new.deletion_requested_at is distinct from old.deletion_requested_at
  ) then
    raise exception 'Protected account fields can only be changed by the server';
  end if;
  return new;
end;
$$;

drop trigger if exists account_private_protect_fields on public.account_private;
create trigger account_private_protect_fields
before update on public.account_private
for each row execute function public.protect_private_account_fields();

create or replace function public.protect_profile_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and new.username is distinct from old.username then
    raise exception 'Username changes require a protected server operation';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_identity on public.profiles;
create trigger profiles_protect_identity
before update on public.profiles
for each row execute function public.protect_profile_identity();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  safe_username text;
begin
  requested_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  if requested_username ~ '^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$'
    and requested_username <> all (
      array[
        'account', 'admin', 'api', 'auth', 'login', 'logout', 'manage',
        'privacy', 'register', 'security', 'settings', 'signup', 'support', 'www'
      ]
    ) then
    safe_username := requested_username;
  else
    safe_username := 'user-' || replace(left(new.id::text, 12), '-', '');
  end if;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    safe_username,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  )
  on conflict (id) do nothing;

  insert into public.account_private (user_id, auth_email, contact_email, phone_e164, phone_country)
  values (
    new.id,
    coalesce(new.email, safe_username || '@users.invalid'),
    nullif(lower(trim(coalesce(new.raw_user_meta_data ->> 'contact_email', ''))), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone_e164', '')), ''),
    nullif(upper(trim(coalesce(new.raw_user_meta_data ->> 'phone_country', ''))), '')
  )
  on conflict (user_id) do nothing;

  insert into public.user_security (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict do nothing;

  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Backfill companion rows for auth users created before this migration.
insert into public.profiles (id, username)
select
  u.id,
  'user-' || replace(left(u.id::text, 12), '-', '')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict do nothing;

insert into public.account_private (user_id, auth_email)
select u.id, coalesce(u.email, 'user-' || replace(left(u.id::text, 12), '-', '') || '@users.invalid')
from auth.users u
where not exists (select 1 from public.account_private a where a.user_id = u.id)
on conflict do nothing;

insert into public.user_security (user_id)
select u.id from auth.users u
on conflict do nothing;

insert into public.user_roles (user_id, role)
select u.id, 'user' from auth.users u
on conflict do nothing;

insert into public.notification_preferences (user_id)
select u.id from auth.users u
on conflict do nothing;

create or replace function public.can_view_owner(candidate uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    candidate = (select auth.uid())
    or exists (
      select 1
      from public.profiles p
      where p.id = candidate
        and p.watchlist_visibility = 'public'
    );
$$;

create or replace function public.owns_product(candidate uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.products p
    where p.id = candidate
      and p.owner_id = (select auth.uid())
  );
$$;

create or replace function public.owns_category(candidate uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.categories c
    where c.id = candidate
      and c.owner_id = (select auth.uid())
  );
$$;

create or replace function public.can_view_product(candidate uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.products p
    where p.id = candidate
      and public.can_view_owner(p.owner_id)
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid())
      and r.role = 'admin'
      and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
  );
$$;

create or replace function public.consume_auth_rate_limit(
  candidate_key_hash text,
  candidate_action text,
  attempt_limit integer,
  window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed boolean;
begin
  insert into public.auth_rate_limits (key_hash, action, attempts, window_started_at)
  values (candidate_key_hash, candidate_action, 1, now())
  on conflict (key_hash, action) do update
    set
      attempts = case
        when public.auth_rate_limits.window_started_at
          < now() - make_interval(secs => window_seconds)
        then 1
        else public.auth_rate_limits.attempts + 1
      end,
      window_started_at = case
        when public.auth_rate_limits.window_started_at
          < now() - make_interval(secs => window_seconds)
        then now()
        else public.auth_rate_limits.window_started_at
      end
  returning attempts <= attempt_limit into allowed;

  return allowed;
end;
$$;

create or replace function public.claim_email_outbox(batch_size integer default 25)
returns setof public.email_outbox
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select id
    from public.email_outbox
    where (
      status in ('pending', 'retry')
      and next_attempt_at <= now()
    ) or (
      status = 'processing'
      and locked_at < now() - interval '10 minutes'
    )
    order by created_at
    for update skip locked
    limit greatest(1, least(batch_size, 100))
  )
  update public.email_outbox o
  set
    status = 'processing',
    locked_at = now(),
    attempt_count = o.attempt_count + 1
  from candidates c
  where o.id = c.id
  returning o.*;
$$;

create or replace function public.unsubscribe_target_email(candidate_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_record record;
begin
  select id, user_id
  into token_record
  from public.email_verification_tokens
  where token_hash = candidate_token_hash
    and purpose = 'unsubscribe'
    and consumed_at is null
    and expires_at > now()
  for update;

  if token_record.id is null then
    return false;
  end if;

  update public.notification_preferences
  set target_price_email = false, updated_at = now()
  where user_id = token_record.user_id;

  insert into public.privacy_consents (
    user_id,
    consent_type,
    granted,
    policy_version,
    source
  )
  values (
    token_record.user_id,
    'target_price_email',
    false,
    '2026-10-15',
    'email_unsubscribe'
  );

  update public.email_verification_tokens
  set consumed_at = now()
  where id = token_record.id;

  return true;
end;
$$;

revoke all on function public.can_view_owner(uuid) from public;
revoke all on function public.owns_product(uuid) from public;
revoke all on function public.owns_category(uuid) from public;
revoke all on function public.can_view_product(uuid) from public;
revoke all on function public.is_admin() from public;
revoke all on function public.consume_auth_rate_limit(text, text, integer, integer) from public;
revoke all on function public.claim_email_outbox(integer) from public;
revoke all on function public.unsubscribe_target_email(text) from public;
grant execute on function public.can_view_owner(uuid) to anon, authenticated;
grant execute on function public.owns_product(uuid) to authenticated;
grant execute on function public.owns_category(uuid) to authenticated;
grant execute on function public.can_view_product(uuid) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.consume_auth_rate_limit(text, text, integer, integer) to service_role;
grant execute on function public.claim_email_outbox(integer) to service_role;
grant execute on function public.unsubscribe_target_email(text) to service_role;

alter table public.profiles enable row level security;
alter table public.account_private enable row level security;
alter table public.user_security enable row level security;
alter table public.user_roles enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.privacy_consents enable row level security;
alter table public.user_preferences enable row level security;
alter table public.email_verification_tokens enable row level security;
alter table public.price_alert_states enable row level security;
alter table public.email_outbox enable row level security;
alter table public.email_delivery_events enable row level security;
alter table public.auth_rate_limits enable row level security;
alter table public.products enable row level security;
alter table public.categories enable row level security;
alter table public.tracked_links enable row level security;
alter table public.price_history enable row level security;
alter table public.crawl_events enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "public read profiles" on public.profiles;
create policy "public read profiles"
on public.profiles for select
to anon, authenticated
using (id = (select auth.uid()) or watchlist_visibility = 'public');

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "users read own private account" on public.account_private;
create policy "users read own private account"
on public.account_private for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "users update own private account" on public.account_private;
create policy "users update own private account"
on public.account_private for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "users read own security state" on public.user_security;
create policy "users read own security state"
on public.user_security for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "users read own roles" on public.user_roles;
create policy "users read own roles"
on public.user_roles for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "users manage own notification preferences" on public.notification_preferences;
create policy "users manage own notification preferences"
on public.notification_preferences for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "users read own consents" on public.privacy_consents;
create policy "users read own consents"
on public.privacy_consents for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "users record own consents" on public.privacy_consents;
create policy "users record own consents"
on public.privacy_consents for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "users manage own preferences" on public.user_preferences;
create policy "users manage own preferences"
on public.user_preferences for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "public read products" on public.products;
drop policy if exists "users read visible products" on public.products;
create policy "users read visible products"
on public.products for select
to anon, authenticated
using (public.can_view_owner(owner_id));

drop policy if exists "users insert own products" on public.products;
create policy "users insert own products"
on public.products for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and (category_id is null or public.owns_category(category_id))
);

drop policy if exists "users update own products" on public.products;
create policy "users update own products"
on public.products for update
to authenticated
using (owner_id = (select auth.uid()))
with check (
  owner_id = (select auth.uid())
  and (category_id is null or public.owns_category(category_id))
);

drop policy if exists "users delete own products" on public.products;
create policy "users delete own products"
on public.products for delete
to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists "public read categories" on public.categories;
drop policy if exists "users read visible categories" on public.categories;
create policy "users read visible categories"
on public.categories for select
to anon, authenticated
using (public.can_view_owner(owner_id));

drop policy if exists "users insert own categories" on public.categories;
create policy "users insert own categories"
on public.categories for insert
to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists "users update own categories" on public.categories;
create policy "users update own categories"
on public.categories for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "users delete own categories" on public.categories;
create policy "users delete own categories"
on public.categories for delete
to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists "public read tracked links" on public.tracked_links;
drop policy if exists "users read visible tracked links" on public.tracked_links;
create policy "users read visible tracked links"
on public.tracked_links for select
to anon, authenticated
using (public.can_view_product(product_id));

drop policy if exists "users insert links for own products" on public.tracked_links;
create policy "users insert links for own products"
on public.tracked_links for insert
to authenticated
with check (public.owns_product(product_id));

drop policy if exists "users update links for own products" on public.tracked_links;
create policy "users update links for own products"
on public.tracked_links for update
to authenticated
using (public.owns_product(product_id))
with check (public.owns_product(product_id));

drop policy if exists "users delete links for own products" on public.tracked_links;
create policy "users delete links for own products"
on public.tracked_links for delete
to authenticated
using (public.owns_product(product_id));

drop policy if exists "public read price history" on public.price_history;
drop policy if exists "users read visible price history" on public.price_history;
create policy "users read visible price history"
on public.price_history for select
to anon, authenticated
using (
  exists (
    select 1
    from public.tracked_links l
    where l.id = price_history.link_id
      and public.can_view_product(l.product_id)
  )
);

drop policy if exists "public read crawl events" on public.crawl_events;
drop policy if exists "users read own crawl events" on public.crawl_events;
create policy "users read own crawl events"
on public.crawl_events for select
to authenticated
using (
  link_id is not null
  and exists (
    select 1
    from public.tracked_links l
    where l.id = crawl_events.link_id
      and public.owns_product(l.product_id)
  )
);

drop policy if exists "users mark own crawl events read" on public.crawl_events;
create policy "users mark own crawl events read"
on public.crawl_events for update
to authenticated
using (
  link_id is not null
  and exists (
    select 1
    from public.tracked_links l
    where l.id = crawl_events.link_id
      and public.owns_product(l.product_id)
  )
)
with check (
  link_id is not null
  and exists (
    select 1
    from public.tracked_links l
    where l.id = crawl_events.link_id
      and public.owns_product(l.product_id)
  )
);

drop policy if exists "public read app settings" on public.app_settings;

create or replace function public.evaluate_target_price_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tracked_product record;
  current_offer record;
  alert_state record;
  next_episode integer;
  destination text;
  alerts_enabled boolean;
begin
  select
    p.id,
    p.owner_id,
    p.name,
    p.target_price
  into tracked_product
  from public.tracked_links l
  join public.products p on p.id = l.product_id
  where l.id = new.link_id;

  if tracked_product.owner_id is null or tracked_product.target_price is null then
    return new;
  end if;

  select latest.price, latest.retailer, latest.url
  into current_offer
  from (
    select distinct on (l.id)
      ph.price,
      l.retailer,
      l.url,
      l.id
    from public.tracked_links l
    join public.price_history ph on ph.link_id = l.id
    where l.product_id = tracked_product.id
      and l.is_active is true
      and (
        l.id = new.link_id
        or coalesce(l.stock_status, 'unknown') <> 'unavailable'
      )
    order by l.id, ph.created_at desc
  ) latest
  order by latest.price asc
  limit 1;

  if current_offer.price is null then
    return new;
  end if;

  select * into alert_state
  from public.price_alert_states s
  where s.product_id = tracked_product.id
  for update;

  if current_offer.price <= tracked_product.target_price
    and coalesce(alert_state.is_below_target, false) is false then
    next_episode := coalesce(alert_state.episode, 0) + 1;

    insert into public.price_alert_states (
      product_id,
      user_id,
      is_below_target,
      episode,
      last_price,
      last_retailer,
      evaluated_at
    )
    values (
      tracked_product.id,
      tracked_product.owner_id,
      true,
      next_episode,
      current_offer.price,
      current_offer.retailer,
      now()
    )
    on conflict (product_id) do update set
      is_below_target = true,
      episode = excluded.episode,
      last_price = excluded.last_price,
      last_retailer = excluded.last_retailer,
      evaluated_at = now();

    select
      a.contact_email,
      n.target_price_email
    into destination, alerts_enabled
    from public.account_private a
    join public.notification_preferences n on n.user_id = a.user_id
    where a.user_id = tracked_product.owner_id
      and a.contact_email_verified_at is not null;

    if destination is not null and alerts_enabled is true then
      insert into public.email_outbox (
        user_id,
        product_id,
        kind,
        recipient,
        payload,
        dedupe_key
      )
      values (
        tracked_product.owner_id,
        tracked_product.id,
        'target_price',
        destination,
        jsonb_build_object(
          'productName', tracked_product.name,
          'targetPrice', tracked_product.target_price,
          'currentPrice', current_offer.price,
          'retailer', current_offer.retailer,
          'url', current_offer.url,
          'episode', next_episode
        ),
        'target:' || tracked_product.id::text || ':' || next_episode::text
      )
      on conflict (dedupe_key) do nothing;
    end if;
  elsif current_offer.price > tracked_product.target_price then
    insert into public.price_alert_states (
      product_id,
      user_id,
      is_below_target,
      episode,
      last_price,
      last_retailer,
      evaluated_at
    )
    values (
      tracked_product.id,
      tracked_product.owner_id,
      false,
      coalesce(alert_state.episode, 0),
      current_offer.price,
      current_offer.retailer,
      now()
    )
    on conflict (product_id) do update set
      is_below_target = false,
      last_price = excluded.last_price,
      last_retailer = excluded.last_retailer,
      evaluated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists price_history_evaluate_target on public.price_history;
create trigger price_history_evaluate_target
after insert on public.price_history
for each row execute function public.evaluate_target_price_alert();

-- Avatar objects are public to read but only writable inside the user's own UUID folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "users upload own avatar" on storage.objects;
create policy "users upload own avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "users update own avatar" on storage.objects;
create policy "users update own avatar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "users delete own avatar" on storage.objects;
create policy "users delete own avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function public.claim_legacy_data(target_username text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  product_count integer;
  category_count integer;
  legacy_layout jsonb;
begin
  select p.id into target_user_id
  from public.profiles p
  where p.username = lower(trim(target_username));

  if target_user_id is null then
    raise exception 'Profile % does not exist', target_username;
  end if;

  update public.products
  set owner_id = target_user_id
  where owner_id is null;
  get diagnostics product_count = row_count;

  update public.categories
  set owner_id = target_user_id
  where owner_id is null;
  get diagnostics category_count = row_count;

  select value into legacy_layout
  from public.app_settings
  where key = 'category_layout';

  if legacy_layout is not null then
    insert into public.user_preferences (user_id, key, value)
    values (target_user_id, 'category_layout', legacy_layout)
    on conflict (user_id, key) do update
      set value = excluded.value, updated_at = now();
  end if;

  update public.profiles
  set watchlist_visibility = 'public'
  where id = target_user_id;

  return jsonb_build_object(
    'user_id', target_user_id,
    'products_claimed', product_count,
    'categories_claimed', category_count,
    'watchlist_visibility', 'public'
  );
end;
$$;

revoke all on function public.claim_legacy_data(text) from public;
grant execute on function public.claim_legacy_data(text) to service_role;

commit;
