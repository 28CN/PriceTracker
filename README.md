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
  that has it. Tap a product to see all shops.
- **Manage** is where you create a category, add a product, and paste up to five shop
  links. The shop name is filled in from the URL. You can come back later to add more
  links, pause one, or delete it.
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
| `CRAWL_PROXY` | send browser traffic through a proxy, e.g. `http://host:8080` |
| `CRAWL_PROXY_USERNAME` / `CRAWL_PROXY_PASSWORD` | credentials for that proxy |
| `CRAWL_SAVE_SNAPSHOTS` | set to `0` to stop writing `crawler-diagnostics/` |

When a page yields no price the crawler saves the HTML and a screenshot under
`crawler-diagnostics/`, and the workflow uploads that folder as an artifact. It is
the quickest way to tell a bot wall apart from a redesigned page.

## Which shops can be crawled

Coles, Woolworths, The Reject Shop and Big W return prices from a GitHub Actions
runner. Kmart and Target sit behind the same Wesfarmers bot wall, which judges the
IP address before it looks at the browser: the product page and the home page both
return `Access Denied` even to an ordinary desktop browser once an address has been
flagged, and the datacentre ranges GitHub Actions runs on start out flagged.

No amount of browser tuning gets past that. The options are:

- Leave those two links paused and rely on the other shops.
- Set the `CRAWL_PROXY` secret to a residential AU proxy.
- Run the workflow on a [self-hosted runner](https://docs.github.com/actions/hosting-your-own-runners)
  on a home connection, which is free and uses a residential address.

Hit rates also drop when the same address requests many pages in a row. Big W will
serve a price, then refuse for several minutes after repeated crawls, so keep the
schedule infrequent rather than retrying hard.

## Notes

- The site has no login. Anyone with the address can add links and queue a refresh,
  which is fine for family use but worth locking down before sharing widely.
- Prices are only read from structured data or price elements on the page. If a shop
  changes its layout the crawler reports it rather than guessing, so a wrong price
  never ends up in the history.
