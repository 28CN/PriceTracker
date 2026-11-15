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

## What would be a bad shortcut

- Deleting or truncating `price_history` to make the list faster.
- A shared CDN cache of `/` or of `/api/products/:id/price-insight`. Both are personal once you are signed in. The public page is now safe to cache in principle, but it still depends on the session cookie (a signed-in person and a stranger share the route), so it stays `private, no-store`.
- Keeping a resolved viewer in a module-level map. Two requests can overlap in one Node process. The map only holds the promise until it settles, and only for the same cookie hash.
