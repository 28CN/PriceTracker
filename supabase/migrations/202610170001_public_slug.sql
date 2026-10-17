-- Public watchlists use a chosen name, separate from the login username.
begin;

alter table public.profiles
  add column if not exists public_slug text;

alter table public.profiles
  drop constraint if exists profiles_public_slug_format;
alter table public.profiles
  add constraint profiles_public_slug_format check (
    public_slug is null
    or public_slug ~ '^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$'
  );

create unique index if not exists profiles_public_slug_key
  on public.profiles (lower(public_slug))
  where public_slug is not null;

update public.profiles
set public_slug = lower(username)
where watchlist_visibility = 'public'
  and public_slug is null;

alter table public.profiles
  drop constraint if exists profiles_public_requires_slug;
alter table public.profiles
  add constraint profiles_public_requires_slug check (
    watchlist_visibility <> 'public' or public_slug is not null
  );

create or replace function public.public_profile_by_slug(candidate text)
returns table (
  id uuid,
  public_slug text,
  display_name text,
  bio text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.public_slug, p.display_name, p.bio
  from public.profiles p
  where p.watchlist_visibility = 'public'
    and p.public_slug = lower(trim(candidate))
  limit 1;
$$;

revoke all on function public.public_profile_by_slug(text) from public;
grant execute on function public.public_profile_by_slug(text) to anon, authenticated;

drop policy if exists "public read profiles" on public.profiles;
drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile"
on public.profiles for select
to authenticated
using (id = (select auth.uid()));

-- Category reads must not depend on visitors being able to select profiles.
drop policy if exists "users read visible categories" on public.categories;
create policy "users read visible categories"
on public.categories for select
to anon, authenticated
using (
  owner_id = (select auth.uid())
  or (
    is_public is true
    and public.can_view_owner(owner_id)
  )
);

commit;
