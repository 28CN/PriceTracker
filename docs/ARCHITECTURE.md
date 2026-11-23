# Architecture

Verified from the code in this repository. Email sending stays off (`app_settings.email_enabled`, default off). The crawler is unchanged.

## Request path

The browser talks to a Next.js 15 app on Vercel. Middleware checks the session on each request (`getClaims`) and, for a demo session older than an hour, signs it out locally. Pages then call `getViewer()`, which reads the profile, roles, and security row with the signed-in Supabase client. Row-level security is what decides which products come back. The service-role key is used for a few server-only jobs: rate limits, the demo reset, creating a crawl job, and the search quota. It is not used to paint the public home page.

The top bar and the page both need the viewer. They share one in-flight read (see [PERFORMANCE.md](PERFORMANCE.md)). That share ends when the promise finishes.

## Prices

`price_history` is append-only from the app's point of view. No migration here deletes it, and no role is granted `TRUNCATE`.

The list used to download up to 2,000 recent rows and keep the first one it saw per link. `latest_link_prices(link_ids uuid[])` returns the newest row per link with `DISTINCT ON`. It is `security invoker` with `search_path = ''`, and `EXECUTE` is granted to `anon`, `authenticated`, and `service_role`. A person only sees prices their existing `price_history` policy already allows, including a public watchlist.

The chart (`GET /api/products/:id/price-insight`) still reads the daily view, the raw rows for the promo weeks, and `price_link_stats`. Those views are also `security invoker`. The response may be reused for 60 seconds in the caller's own browser. It is not a shared cache.

## Checks

`crawl_jobs` records a requested crawl (`pending`, `running`, `done`, `failed`). Until this migration, signed-in users could not read it, so the card guessed "Checking soon" whenever a date was missing. Owners can now read `id`, `product_id`, `link_id`, `status` and `created_at` for jobs whose `product_id` they own (`owns_product`, which is `security definer` and compares `owner_id` to `(select auth.uid())`). `requested_by`, `runner` and `last_error` are not granted. They cannot write jobs through that policy. Jobs with no product (an administrator refreshing every account) stay hidden. The card ignores open jobs older than 36 hours so a stuck row does not say "Checking soon" forever.

A partial index `crawl_jobs_product_open_idx` covers `product_id` where status is `pending` or `running`.

**Apply `supabase/migrations/202611150001_latest_prices_and_job_status.sql` to production before relying on either change.** Until then, the list falls back to the old price scan and treats check state as unknown, which shows **No price yet** rather than a false **Checking soon**.

## Search

Search is split across three layers so own-list lookups need no network round trip and live provider calls stay strictly opt-in:

1. **Own list (client-side, instant):** the page passes the signed-in user's tracked products (`id`, `name`, shop names, cheapest fresh price / stale price, thumbnail via `productThumb`) to `ProductSearch`, which filters and ranks up to 5 matches in memory using `src/lib/searchMatch.ts`. No request is sent while filtering your own list.
2. **Shared cache (`GET /api/search?q=...`, debounced 350 ms at 3+ characters):** requires a signed-in session (works for demo accounts too) and never spends quota. The route reads `q:*` rows from `product_search_cache` — both fresh and stale — and matches them fuzzily in TypeScript with `searchMatch`. Stale hits carry `stale: true` and `fetchedAt` so the UI labels them `Prices from <date>`. Cache keys are stored in compact normalised form (`q:<compact>`) so `hotwheels` and `hot wheels` share one entry. No `pg_trgm` extension or migration is used: production currently holds 21 products, 69 links, and 3 cache rows (22 results), where in-memory matching is faster and simpler than a trigram index.
3. **Live lookup (`POST /api/search`, explicit Enter or "Search shops" button):** checks same-origin and auth, checks the fresh 24-hour cache first (compact and legacy spaced keys) to avoid redundant calls, and otherwise runs SerpApi Google Shopping only for a real (non-demo) account inside the quota: 5 a day, 30 a month, 8 for the whole site a day, on the Sydney calendar. When blocked by demo mode or a cap, it falls back to matching rows from `product_search_cache` alongside the limit notice. Link resolution is a second request (`POST /api/search/shops`) and is metered too.

The price on a search result is a listed price from that lookup (or a dated cached price). It is not written to `price_history` until the person tracks the product and a crawl actually records one. Quota failures return a clear limit and a link to Google Shopping. The demo account cannot spend quota.

Tracking posts to `/api/products` and only then says **Tracked**. A second click is ignored while the first is still saving.

## What is private

- Product lists, goals, and crawl jobs are per owner.
- The public home page does not read them.
- Search cache entries are shop results, not watchlists.
- The chart cache directive is `private`. Middleware still sends `private, no-store` for every other route.
