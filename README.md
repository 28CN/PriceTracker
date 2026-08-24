# PriceTracker

A small price matrix for Australian shops. You save a product once, paste the links
for each shop that stocks it, and a scheduled crawler fills in the prices. The site
shows the cheapest shop up front and the full list when you tap a product.

- **Supabase** stores products, links and price history
- **GitHub Actions** runs the crawler twice a week, and on demand
- **Vercel** hosts the site

## Setup

### 1. Database

Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor. It adds
the `categories` and `crawl_events` tables, links products to a category, and makes
`target_price` optional. It is safe to run more than once.

### 2. GitHub repository secrets

`Settings` -> `Secrets and variables` -> `Actions`:

| Secret | Value |
| --- | --- |
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the secret (`sb_secret_...`) key |

### 3. Vercel environment variables

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the publishable (`sb_publishable_...`) key |
| `SUPABASE_SERVICE_ROLE_KEY` | the secret key, used by the write routes |
| `GITHUB_TOKEN` | a personal access token with the `workflow` scope |
| `GITHUB_OWNER` | your GitHub username |
| `GITHUB_REPO` | the repository name |
| `GITHUB_WORKFLOW_ID` | `crawl-prices.yml` |
| `GITHUB_REF` | `main` |

Redeploy after adding them so the new values are picked up.

## Using the site

- **Home** lists every tracked product with its cheapest current price and the shop
  that has it. Tap a product to see all shops. Pin a category to keep it at the top
  and expanded. Products currently at or under their target price sort first.
- **Manage** is where you create a category, add a product, and paste up to five shop
  links. The shop name is filled in from the URL. You can come back later to add more
  links, pause one, or delete it.
- A tiny **pending support** label appears on shops the crawler does not have a
  dedicated parser for yet. Unknown shops still go through JSON-LD, Shopify product
  JSON, and generic price CSS. Failures are written to
  `crawler/pending-retailers.json` so the next code update can add them.
- The **flag button** in the top right collects crawler notices, such as a link that
  has gone dead or a page where no price could be found.
- The **refresh button** next to it queues an immediate crawl through GitHub Actions.
  Give it a couple of minutes, then reload.

## Running the crawler locally

```bash
pip install -r crawler/requirements.txt
python -m playwright install chromium
python -m playwright install chrome   # important, see below
python crawler/main.py
```

Install `chrome` as well as `chromium`. Given no channel, Playwright 1.49 and newer
start `chrome-headless-shell`, an old headless build that Akamai rejects on sight;
Big W answers 403 to it and 200 to every branded build. The crawler tries
`chrome`, `msedge`, `chromium` and only then the bare shell, and prints the channel
it settled on as `[BROWSER] channel=...` on the first line of every run.

Useful environment variables:

| Variable | Effect |
| --- | --- |
| `TEST_URL` | parse one page and print the price, without touching the database |
| `CRAWL_PRODUCT_ID` | only crawl the links belonging to one product |
| `CRAWL_LINK_ID` | only crawl a single link |
| `CRAWL_RETAILERS` | only crawl matching shops, e.g. `kmart,target,bigw,toymate` |
| `CRAWL_SKIP_RETAILERS` | crawl everything except these shops |
| `CRAWL_BROWSER_MODE` | `cdp` (default) or `launch`, see below |
| `CRAWL_BROWSER_PATH` | use a specific Chrome or Edge binary |
| `CRAWL_BROWSER_PROFILE` | where the browser profile lives, so cookies persist |
| `CRAWL_PROXY` | send browser traffic through a proxy, e.g. `http://host:8080` |
| `CRAWL_PROXY_USERNAME` / `CRAWL_PROXY_PASSWORD` | credentials for that proxy |
| `CRAWL_SAVE_SNAPSHOTS` | set to `0` to stop writing `crawler-diagnostics/` |

When a page yields no price the crawler saves the HTML and a screenshot under
`crawler-diagnostics/`, and the workflow uploads that folder as an artifact. It is
the quickest way to tell a bot wall apart from a redesigned page.

## How the browser is driven

The crawler does not let Playwright start the browser. It starts an ordinary
Chrome or Edge itself, with a debugging port open, and drives it over CDP.

That distinction decides whether Kmart and Target answer at all. Measured against
both, on one machine, within a few minutes of each other:

| How the browser was started | Kmart / Target |
| --- | --- |
| Playwright, headless | `Access Denied` |
| Playwright, headful | `Access Denied` |
| Playwright, headful, stealth off | `Access Denied` |
| Started normally, driven over CDP, headless | `Access Denied` |
| Started normally, driven over CDP, headful | price returned |

So it needs both a real browser started the ordinary way *and* a display. There is
nothing to solve or wait out: the same page in the same browser build differs only
by how the process was started.

`CRAWL_BROWSER_MODE=cdp` is the default. If no Chrome or Edge is installed, or
there is no display, the crawler says so and falls back to letting Playwright
launch one, which still works for Coles, Woolworths, The Reject Shop, Toys R Us
and Toyworld.

Unknown specialty shops are crawled with a generic path (JSON-LD, Shopify
product JSON, then CSS). If that is not enough, the host is appended to
`crawler/pending-retailers.json` and a crawler notice is raised. Kmart, Target,
Big W and Toymate need this PC (`crawl-local.bat`) because they refuse
datacentre browsers.

## Splitting the work between machines

GitHub Actions has no display of its own, so the workflow runs the crawler under
`xvfb-run`. Whether the shops answer a datacentre address is a separate question
from the browser, and Kmart, Target, Big W and Toymate may still refuse from there.

If they do, crawl them from your own PC instead:

- Easiest: double-click `crawl-local.bat` in the repo root (window stays open so you can read errors).
- Or from a terminal already in the repo:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\crawl-local.ps1
```

It opens a browser window (Chrome preferred, then Edge), collects the shops listed in
`CRAWL_RETAILERS`, and closes it again. Leave the window alone while it runs.
Schedule it with Task Scheduler if you want it unattended, and set the
`CRAWL_SKIP_RETAILERS` repository variable to the same list so the cloud run stops
retrying them.

Do not use Win+R alone — that closes the window as soon as the script exits, so
errors flash past. The `.bat` file (or an already-open PowerShell / Terminal) is
the reliable way.

Hit rates drop when one address requests many pages in a row. Big W will serve a
price and then refuse for several minutes after repeated crawls, so keep the
schedule infrequent rather than retrying hard.

## Notes

- The site has no login. Anyone with the address can add links and queue a refresh,
  which is fine for family use but worth locking down before sharing widely.
- Prices are only read from structured data or price elements on the page. If a shop
  changes its layout the crawler reports it rather than guessing, so a wrong price
  never ends up in the history.
