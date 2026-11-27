-- Fast-food deals for /eat, from OzBargain chain and tag feeds, fetched by the
-- same "Fetch OzBargain deals" job as /deals but on a slower clock
-- (crawler/eat.py). Only the title, the OzBargain deal link, the chain, votes,
-- dates, category and the feed's own image URL are kept. Old rows are pruned by the job;
-- this is not price history.
create table if not exists public.eat_deals (
  node_id bigint primary key check (node_id > 0),
  title text not null check (length(title) between 1 and 300),
  deal_url text not null check (deal_url ~ '^https://www\.ozbargain\.com\.au/node/[0-9]+$'),
  chain text not null check (chain ~ '^[a-z0-9-]{2,30}$'),
  votes_pos integer not null default 0 check (votes_pos >= 0),
  votes_neg integer not null default 0 check (votes_neg >= 0),
  posted_at timestamptz not null,
  starts_at timestamptz,
  expires_at timestamptz,
  is_expired boolean not null default false,
  image_url text check (
    image_url is null
    or (length(image_url) <= 400 and image_url ~ '^https://files\.ozbargain\.com\.au/[A-Za-z0-9/._?=&%-]+$')
  ),
  first_seen_at timestamptz not null default now(),
  fetched_at timestamptz not null default now()
);

-- OzBargain's category ("Dining & Takeaway"), to leave out points/travel offers.
alter table public.eat_deals add column if not exists category text;
alter table public.eat_deals drop constraint if exists eat_deals_category_length;
alter table public.eat_deals add constraint eat_deals_category_length check (category is null or length(category) <= 60);

create index if not exists eat_deals_posted on public.eat_deals (posted_at desc);

-- One row per food feed, with the validators for conditional GET.
create table if not exists public.eat_feed_status (
  feed text primary key check (feed ~ '^[a-z0-9-]{2,30}$'),
  last_attempt_at timestamptz not null default now(),
  last_ok_at timestamptz,
  item_count integer not null default 0 check (item_count >= 0),
  etag text,
  last_modified text,
  last_status integer
);

alter table public.eat_deals enable row level security;
alter table public.eat_feed_status enable row level security;

drop policy if exists "eat deals are public" on public.eat_deals;
create policy "eat deals are public" on public.eat_deals
  for select to anon, authenticated using (true);

drop policy if exists "eat feed status is public" on public.eat_feed_status;
create policy "eat feed status is public" on public.eat_feed_status
  for select to anon, authenticated using (true);

-- Visitors read; only the job (service_role) writes. No TRUNCATE for anyone.
-- Feed validators stay private: anon/authenticated get named columns only.
revoke all on public.eat_deals from public, anon, authenticated, service_role;
revoke all on public.eat_feed_status from public, anon, authenticated, service_role;
grant select on public.eat_deals to anon, authenticated;
grant select (feed, last_attempt_at, last_ok_at, item_count) on public.eat_feed_status to anon, authenticated;
grant select, insert, update, delete, references, trigger on public.eat_deals to service_role;
grant select, insert, update, delete, references, trigger on public.eat_feed_status to service_role;

-- The food feeds' own clock, next to the /deals one.
alter table public.ozb_refresh_state add column if not exists food_last_run_at timestamptz;
alter table public.ozb_refresh_state add column if not exists food_last_visit_at timestamptz;
alter table public.ozb_refresh_state add column if not exists food_last_dispatch_at timestamptz;

-- Opening /eat: note the visit and ask for the food feeds when the last fetch
-- is 30+ minutes old, at most once per 20 minutes. The visit time moves at
-- most once a minute.
create or replace function public.note_eat_visit()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  state public.ozb_refresh_state%rowtype;
  want boolean := false;
begin
  select * into state from public.ozb_refresh_state where id for update;
  if not found then
    insert into public.ozb_refresh_state (id) values (true) on conflict (id) do nothing;
    select * into state from public.ozb_refresh_state where id for update;
  end if;

  want := (state.food_last_run_at is null or state.food_last_run_at < now() - interval '30 minutes')
      and (state.food_last_dispatch_at is null or state.food_last_dispatch_at < now() - interval '20 minutes');

  if want then
    update public.ozb_refresh_state
       set food_last_visit_at = now(), food_last_dispatch_at = now()
     where id;
  elsif state.food_last_visit_at is null or state.food_last_visit_at < now() - interval '1 minute' then
    update public.ozb_refresh_state set food_last_visit_at = now() where id;
  end if;

  return want;
end;
$$;

revoke all on function public.note_eat_visit() from public;
grant execute on function public.note_eat_visit() to anon, authenticated, service_role;
