-- Deals from OzBargain shop feeds (/deals/<domain>/feed), fetched by the
-- "Fetch OzBargain deals" GitHub Action a few times a day.
-- Stores only the title, a link to the OzBargain deal page, the shop, votes and
-- dates. No descriptions or images are copied. Old rows are pruned by the job;
-- this is not price history.
create table if not exists public.ozb_deals (
  node_id bigint primary key check (node_id > 0),
  title text not null check (length(title) between 1 and 300),
  deal_url text not null check (deal_url ~ '^https://www\.ozbargain\.com\.au/node/[0-9]+$'),
  shop text not null check (shop ~ '^[a-z0-9-]{2,30}$'),
  tab text not null check (tab in ('shops', 'online')),
  votes_pos integer not null default 0 check (votes_pos >= 0),
  votes_neg integer not null default 0 check (votes_neg >= 0),
  posted_at timestamptz not null,
  starts_at timestamptz,
  expires_at timestamptz,
  is_expired boolean not null default false,
  first_seen_at timestamptz not null default now(),
  fetched_at timestamptz not null default now()
);

create index if not exists ozb_deals_tab_posted on public.ozb_deals (tab, posted_at desc);

-- One row per feed: when it was last tried and last worked, so the page can
-- say a shop's deals may be out of date instead of failing.
create table if not exists public.ozb_feed_status (
  shop text primary key check (shop ~ '^[a-z0-9-]{2,30}$'),
  last_attempt_at timestamptz not null default now(),
  last_ok_at timestamptz,
  item_count integer not null default 0 check (item_count >= 0)
);

alter table public.ozb_deals enable row level security;
alter table public.ozb_feed_status enable row level security;

drop policy if exists "deals are public" on public.ozb_deals;
create policy "deals are public" on public.ozb_deals
  for select to anon, authenticated using (true);

drop policy if exists "feed status is public" on public.ozb_feed_status;
create policy "feed status is public" on public.ozb_feed_status
  for select to anon, authenticated using (true);

-- Explicit grants (no TRUNCATE for anyone), consistent with 202610290012.
-- Visitors can only read; only the server-side job (service_role) writes.
revoke all on public.ozb_deals from public, anon, authenticated, service_role;
revoke all on public.ozb_feed_status from public, anon, authenticated, service_role;
grant select on public.ozb_deals to anon, authenticated;
grant select on public.ozb_feed_status to anon, authenticated;
grant select, insert, update, delete, references, trigger on public.ozb_deals to service_role;
grant select, insert, update, delete, references, trigger on public.ozb_feed_status to service_role;
