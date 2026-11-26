-- Follow or mute a brand on the Deals page (tap a brand tag).
-- One row per user and brand; owners only; the demo account cannot write.

create table if not exists public.deal_brand_prefs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  brand_key text not null check (brand_key ~ '^[a-z0-9 ]{1,40}$'),
  label text not null check (char_length(label) between 1 and 40),
  state text not null check (state in ('follow', 'mute')),
  updated_at timestamptz not null default now(),
  primary key (user_id, brand_key)
);

alter table public.deal_brand_prefs enable row level security;

drop policy if exists "users manage own brand prefs" on public.deal_brand_prefs;
create policy "users manage own brand prefs" on public.deal_brand_prefs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "demo users cannot insert" on public.deal_brand_prefs;
create policy "demo users cannot insert" on public.deal_brand_prefs
  as restrictive for insert to authenticated
  with check (not (select public.is_demo_user()));

drop policy if exists "demo users cannot update" on public.deal_brand_prefs;
create policy "demo users cannot update" on public.deal_brand_prefs
  as restrictive for update to authenticated
  using (not (select public.is_demo_user()));

drop policy if exists "demo users cannot delete" on public.deal_brand_prefs;
create policy "demo users cannot delete" on public.deal_brand_prefs
  as restrictive for delete to authenticated
  using (not (select public.is_demo_user()));

revoke all on public.deal_brand_prefs from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.deal_brand_prefs to authenticated;
grant select, insert, update, delete on public.deal_brand_prefs to service_role;

-- At most 100 brands per person.
create or replace function public.deal_brand_prefs_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.deal_brand_prefs where user_id = new.user_id) >= 100 then
    raise exception 'brand limit reached' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.deal_brand_prefs_limit() from public, anon, authenticated;

drop trigger if exists deal_brand_prefs_limit on public.deal_brand_prefs;
create trigger deal_brand_prefs_limit
  before insert on public.deal_brand_prefs
  for each row execute function public.deal_brand_prefs_limit();
