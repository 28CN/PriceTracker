-- PriceTracker schema additions.
-- Run this in the Supabase SQL editor. Safe to run more than once.

-- 1. Categories, so tracked products can be grouped (e.g. Bluey, Hot Wheels).
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists categories_name_key on public.categories (lower(name));

-- 2. Link products to a category and make the target price optional.
alter table public.products
  add column if not exists category_id uuid references public.categories (id) on delete set null;

alter table public.products
  alter column target_price drop not null;

-- 3. Crawler notifications (dead links, parse failures, run summaries).
create table if not exists public.crawl_events (
  id uuid primary key default gen_random_uuid(),
  link_id uuid references public.tracked_links (id) on delete cascade,
  level text not null default 'info',
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- 4. Indexes for the queries the app actually runs.
create index if not exists tracked_links_product_id_idx on public.tracked_links (product_id);
create index if not exists price_history_link_created_idx on public.price_history (link_id, created_at desc);
create index if not exists crawl_events_created_idx on public.crawl_events (created_at desc);
create index if not exists crawl_events_unread_idx on public.crawl_events (is_read, created_at desc);

-- 5. Row level security. The site reads with the publishable (anon) key and
-- writes through server routes that use the secret key, so read-only policies
-- are all the browser needs.
alter table public.categories enable row level security;
alter table public.crawl_events enable row level security;
alter table public.products enable row level security;
alter table public.tracked_links enable row level security;
alter table public.price_history enable row level security;

drop policy if exists "public read categories" on public.categories;
create policy "public read categories" on public.categories
  for select using (true);

drop policy if exists "public read crawl events" on public.crawl_events;
create policy "public read crawl events" on public.crawl_events
  for select using (true);

-- Without these three the home page renders an empty list: RLS hides every row
-- from the anon key and returns success rather than an error.
drop policy if exists "public read products" on public.products;
create policy "public read products" on public.products
  for select using (true);

drop policy if exists "public read tracked links" on public.tracked_links;
create policy "public read tracked links" on public.tracked_links
  for select using (true);

drop policy if exists "public read price history" on public.price_history;
create policy "public read price history" on public.price_history
  for select using (true);
