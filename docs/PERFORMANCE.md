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

## What would be a bad shortcut

- Deleting or truncating `price_history` to make the list faster.
- A shared CDN cache of `/` or of `/api/products/:id/price-insight`. Both are personal once you are signed in. The public page is now safe to cache in principle, but it still depends on the session cookie (a signed-in person and a stranger share the route), so it stays `private, no-store`.
- Keeping a resolved viewer in a module-level map. Two requests can overlap in one Node process. The map only holds the promise until it settles, and only for the same cookie hash.
