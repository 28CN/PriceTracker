-- Baseline for the tables that existed before the account migrations.
-- They were originally created by hand in the Supabase dashboard and later
-- patched through the now-removed supabase/schema.sql. Captured from the live
-- project (information_schema / pg_indexes, 2026-10-29) so a fresh database
-- can be built from supabase/migrations/ alone.
--
-- Fully idempotent: on the live database every statement is a no-op. It never
-- drops, truncates or rewrites data (price_history rows are untouched).


create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_price numeric,
  created_at timestamptz default timezone('utc'::text, now())
);

alter table public.products
  add column if not exists category_id uuid references public.categories (id) on delete set null;
alter table public.products
  alter column target_price drop not null;
alter table public.products
  add column if not exists image_url text;

create table if not exists public.tracked_links (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products (id) on delete cascade,
  retailer text not null,
  url text not null,
  is_active boolean default true,
  created_at timestamptz default timezone('utc'::text, now())
);

alter table public.tracked_links add column if not exists image_url text;
alter table public.tracked_links add column if not exists image_candidates jsonb;

create table if not exists public.price_history (
  id uuid primary key default gen_random_uuid(),
  link_id uuid references public.tracked_links (id) on delete cascade,
  price numeric not null,
  created_at timestamptz default timezone('utc'::text, now())
);

create table if not exists public.crawl_events (
  id uuid primary key default gen_random_uuid(),
  link_id uuid references public.tracked_links (id) on delete cascade,
  level text not null default 'info',
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists tracked_links_product_id_idx on public.tracked_links (product_id);
create index if not exists price_history_link_created_idx on public.price_history (link_id, created_at desc);
create index if not exists crawl_events_created_idx on public.crawl_events (created_at desc);
create index if not exists crawl_events_unread_idx on public.crawl_events (is_read, created_at desc);

-- RLS is enabled and the owner-aware policies are created by
-- 202610150001_accounts_and_rls.sql.
