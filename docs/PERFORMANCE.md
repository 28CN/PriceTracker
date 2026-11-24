# Performance

Numbers below were measured. Where a number was not measured, it says so. Nothing here deletes price history.

## What was slow

On 15 November 2026, from a Linux lab VM (UTC, not a phone in Kuala Lumpur), the public production site was:

| Request | Runs | Result |
| --- | --- | --- |
| `GET /` full response, first series | 10 | min 1.404s, median 1.861s, max 5.649s. Every response `x-vercel-cache: MISS`, about 45 KB |
| `GET /` immediately after, same client | 10 | 9 succeeded (one TLS failure). min 1.828s, median 2.293s, max 3.215s. Still `MISS` |
| `GET /` a second series of 5 | 5 | median 3.008s |
| `GET /login` | 5 | median 0.110s, about 25 KB |

Headless Chrome, 390px wide, production `/`, 10 loads: no Largest Contentful Paint entry was recorded (headless often drops it). DOMContentLoaded was 1.38s to 3.64s, median about 2.0s. Time to first byte inside the browser was a few milliseconds, so the wait was the server building the HTML, not the connection.

`/login` is the same app and the same auth check, and it answers in about a tenth of a second. `/` was the outlier. The code path that only `/` took was loading one admin account's entire product list, on the service-role key, before sending any HTML. Signing in sends you to `/` as well, so the "sign-in takes several seconds" report matches this document wait. The sign-in form itself was not separately timed with a real password. This environment does not have one, and the demo sign-in resets a shared password, so it was not hammered.

There is no CrUX field data here. The 2.5s / 200ms / 0.1 targets are aspirations for the field, not a score this sample can claim. Lighthouse TBT was not used as a stand-in for INP.

## Sign-in to the list

On the preview, a signed-in check from the owner's browser took about 19.6 seconds from pressing Sign in until the product list appeared. That timing is theirs (rough, one pass, and the function may have been cold). This environment has no password for that account, so it was not repeated here.

The database host `db.yvvreaqbxzcemvgimbpa.supabase.co` is IPv6 `2406:da14:25a:5800:9418:94ee:4e2:78c8`. ipinfo places that address in Tokyo (Amazon). There was no region in the project config, so Vercel was running the functions in its default US East region. SQL from those functions goes to Tokyo. Sign-in does several of those queries one after another: the rate limit and the username lookup (now together), then the email and the password flag together, then the password check. The list page then checks the session, reads the account, and loads products, links, and the latest prices. A cold start sits on top. This VM is in Ashburn and has no IPv6 route, so the Tokyo hop itself was not timed. Unauthenticated requests to the project API from here came back from Cloudflare in Ashburn (`cf-ray` ending `IAD`) in 43–134 ms, and they were rejected before any SQL, so that is not the database cost.

`getClaims()` calls the auth server, the same kind of request as `getUser()`, when the session token has no asymmetric key id. The library does that for the older shared secret and when WebCrypto is missing. A real token was not inspected here, so that extra trip is possible rather than confirmed. Before this change the sign-in POST made one such call before the password check, and the list page made one in middleware and another while loading the account.

What changed:

- Functions are pinned to Tokyo (`hnd1` in `vercel.json`, and `preferredRegion` on the root layout), next to the database.
- The sign-in POST no longer checks for an existing session first. The rate limit and the username lookup run together.
- Middleware records who is signed in and how long that check took. The list page reuses that instead of calling `getClaims()` again, and starts the account read together with the product query.
- The list response sends a `Server-Timing` header. The name is `Server-Timing`. The three durations are `auth` (the session check in middleware), `list` (waiting on the product query and the account read), and `render` (the rest of the page function, before React writes HTML). It does not include the browser. In the network panel, open the document request for `/` and read that header. The signed-in durations after this change are for that measurement. They are not invented here.

The public home page timings in the next section are a different journey (no sign-in, no product list).

On this same machine, after `next build` and `next start`, with a placeholder Supabase URL and no real database, eight requests to signed-out `/` all returned `Server-Timing`. `list` was 0 every time. `auth` was 4, 0, 1, 0, 1, 0, 1, 0 ms. `render` was 4, 1, 1, 1, 1, 0, 0, 0 ms. That checks the header. It is not the signed-in preview, and the signed-in number after this change is still open.

## What changed

1. The public page no longer reads a private catalogue. The sample card is static.
2. The top bar and the page were each resolving the signed-in person (session, profile, roles, security). Those calls now share one in-flight promise, keyed by a hash of that request's own cookies, and the promise is deleted when it finishes. A later request does not reuse it. React 18 in this repo has no `cache()`, which is why it is not `React.cache()`.
3. Profile, role, and security are asked for together, not one after another. Sign-in looks up the email and the "must change password" flag together, after the rate limit.
4. The newest price per link is `latest_link_prices`, a `DISTINCT ON (link_id)` read. It is `security invoker`, so row-level security still applies. If that function is not installed yet, the old 2,000-row scan is the fallback. History rows are not deleted either way.

   `price_history.created_at` is nullable. The index already on production is `price_history_link_created_idx (link_id, created_at DESC)`. In Postgres a `DESC` key is `NULLS FIRST`, so `ORDER BY created_at DESC NULLS LAST` would not match it and would sort. The function filters `created_at IS NOT NULL` and orders by `link_id, created_at DESC` only. That is the index order: within one link, nulls sit at the front of the index and are excluded, and the first remaining entry is the newest timestamp. `DISTINCT ON (link_id)` can take that first entry from an ordered index scan. No second index was added. A tie on the exact same timestamp is left as the index stores it. `id` is not part of the index, so ordering by it would ask for a sort. `link_id = ANY(...)` can also be planned as a bitmap scan, which uses this same index and then sorts. This was reasoned from the index definition. `EXPLAIN` was not run on production.
5. Crawl-event text is only searched for links whose stock is still unknown.
6. The price chart's JavaScript loads when a card is opened, not with the list. A repeat open of the same chart within 60 seconds can be served from that browser only (`Cache-Control: private, max-age=60`). There is no `public` or `s-maxage`.

## After, on this machine only

`next build` then `next start` on the same VM, with a placeholder Supabase URL (no real database round trip):

| Request | 10 runs |
| --- | --- |
| `GET /` | min 0.011s, median 0.015s, max 0.139s, about 37 KB |
| `GET /login` | median 0.010s |
| `GET /preview/cards` | median 0.013s |

This is not a fair pair with the production numbers. It shows the page can be sent without the catalogue query. It does not include a real auth round trip or a real price read. After the migration is applied and this build is deployed, production `/` should look much more like today's `/login` than like today's `/`, because the extra work was the catalogue. That sentence is an inference, not a measurement.

The signed-in list and the chart were not re-timed against production data. The chart still reads daily rows, raw history for the promo weeks, and the stats view. The stats view walks history for those links. That is the remaining cost, and it is left in place so the chart stays honest. A private 60-second browser cache only helps the second open.

## Search

Reproduce both tables below locally with `node scripts/bench-search.mjs` (runs `scripts/bench-search.vitest.ts` via Vitest; excluded from `npm test`).

- **Old flow:** finding a product already on your own list required submitting the form and waiting for a `POST /api/search` round trip (session check, `is_demo` lookup, and a Postgres `ilike` query on `products`). The production round-trip time for `POST /api/search` was not measured here.
- **New flow (client-side own-list filter):** measured on `Intel(R) Xeon(R) Processor` (8 cores, `linux x64`, Node `v24.22.1`) via `node scripts/bench-search.mjs` over 1,000 iterations (after 100 warmup iterations) across 8 queries (`hotwheels`, `hot wheels`, `cars`, `kmrat`, `batteries`, `storage boxes`, `kmart`, `nonexistentxyz`) on synthetic product lists:

| Operation | Dataset | Iterations | Median | p95 |
| --- | --- | --- | --- | --- |
| `rankPreparedItems` (pre-prepared via `useMemo`, as in `ProductSearch`) | 21 products | 1,000 | 0.024 ms | 0.067 ms |
| `rankSearchItems` (unprepared each call) | 21 products | 1,000 | 0.129 ms | 0.204 ms |
| `rankPreparedItems` (pre-prepared via `useMemo`) | 500 products | 1,000 | 0.699 ms | 1.316 ms |
| `rankSearchItems` (unprepared each call) | 500 products | 1,000 | 4.025 ms | 5.731 ms |

- **New flow (free cache route `GET /api/search`):** measured by the same `node scripts/bench-search.mjs` run on the same machine with mocked `getApiAuth` and mocked `createAdminSupabaseClient` (1,000 iterations after 50 warmup iterations, including `NextRequest` handling and JSON serialisation, excluding real Postgres and network round-trip latency):

| Route | Mocked cache size | Iterations | Median | p95 |
| --- | --- | --- | --- | --- |
| `GET /api/search` | 3 rows / 22 results | 1,000 | 0.186 ms | 0.330 ms |
| `GET /api/search` | 50 rows / 500 results | 1,000 | 2.949 ms | 3.530 ms |

Real production network and Postgres round-trip times for `GET /api/search` and `POST /api/search` were not measured in this environment.

## Smoothness (landing kangaroo, art style, dashboard)

Measured on 23 Nov 2026 on a local production build (`npm run build`, `next start`, placeholder Supabase env as in CI), headless Chrome driven by Playwright with 4x CPU throttling, median of 7 page loads per row. "Before" is `main` at `a574f01`; "after" is this branch. Both builds had the same small change to `/preview/dashboard`: `?overview=fetch` skips the built-in sample data so the page fetches **This week** after paint, like the signed-in page. The test answered `/api/overview` with the same sample data after an 800 ms delay.

- CLS: sum of `layout-shift` entries without recent input.
- LCP: last `largest-contentful-paint` entry.
- Blocking: sum of (long task - 50 ms) during load.
- Typing: 14 keys typed into search with a 30 ms gap, wall time minus the 400 ms settle wait; blocking is long-task time while typing.
- Card click: time from `click()` on the first card to the next frame, at 1440 px (side panel).

| Page | Width | CLS before / after | LCP before / after | Blocking before / after | Typing before / after | Card click before / after |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | 390 | 0 / 0 | 148 / 184 ms | 58 / 95 ms | - | - |
| `/` | 1440 | 0 / 0 | 168 / 180 ms | 55 / 115 ms | - | - |
| `/preview/dashboard?overview=fetch` | 1440 | 0 / 0 | 240 / 192 ms | 96 / 82 ms | 681 / 565 ms, 0 / 0 ms blocking | 19 / 18 ms |
| `/preview/dashboard?overview=fetch` | 390 | 0 / 0 | 200 / 176 ms | 91 / 82 ms | 587 / 566 ms, 0 / 0 ms blocking | - |

First Load JS for `/` is 136 kB before and after (`next build` output). The kangaroo's script is a separate chunk loaded after hydration (`next/dynamic`, `ssr: false`); the shelf and price tickets are server-rendered markup, and a 6 KB still frame holds the kangaroo's place until then. The 246 KB GIF is only requested once the scene is on screen and the browser is idle, and never with reduced motion.

What the numbers say, honestly:

- Layout shift was already 0 on `main`, so reserving space did not move CLS. The side column did move, though, because it is sticky and nothing sits below it: it grew from 240 px to 542 px when **This week** arrived. The loading placeholder now holds 420 px, so it goes from 511 px to 556 px (measured the same way, at 700 ms and 2.7 s).
- The landing page blocks the main thread longer than before (roughly +40 to +60 ms at 4x throttle) because the kangaroo is back: its chunk, the GIF decode and the ticket motion. It pauses when off-screen or in a hidden tab.
- An early LCP regression on this branch was traced to the hero fading in: the still frame and, on the dashboard, the summary heading started at opacity 0, so the reported LCP moved to whatever painted later (on the dashboard, a **This week** row after the 800 ms fetch). The first panel on each page now appears without the rise-in animation; lower panels keep it.
- Typing in search did not cause long tasks before or after. The list ranking now uses `useDeferredValue`, cards are memoised, and the select handler is stable, so opening one card does not re-render the rest. The typing and click times above are within run-to-run noise; they are not a claimed speed-up.
- Groups from the third one down use `content-visibility: auto`. With the 8 sample products there is nothing to measure; it matters for long lists.
- Transitions are limited to `transform` and `opacity`. The accordion now fades instead of animating its row height.

These are lab numbers on one machine, not field data from production.

## Shopping list

First Load JS for `/` went from 136 kB to 137 kB (`next build` output on this
machine). The extra kilobyte is the Tracked tile button and the loader stub; the
shopping list itself is a separate chunk fetched the first time it is opened
(`next/dynamic`, `ssr: false`). It works from the products already on the page,
so opening it makes no network request apart from that chunk, and the lists are
only computed while it is open (`useMemo`).

## What would be a bad shortcut

- Deleting or truncating `price_history` to make the list faster.
- A shared CDN cache of `/` or of `/api/products/:id/price-insight`. Both are personal once you are signed in. The public page is now safe to cache in principle, but it still depends on the session cookie (a signed-in person and a stranger share the route), so it stays `private, no-store`.
- Keeping a resolved viewer in a module-level map. Two requests can overlap in one Node process. The map only holds the promise until it settles, and only for the same cookie hash.
