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
python crawler/main.py
```

Useful environment variables:

| Variable | Effect |
| --- | --- |
| `TEST_URL` | parse one page and print the price, without touching the database |
| `CRAWL_PRODUCT_ID` | only crawl the links belonging to one product |
| `CRAWL_LINK_ID` | only crawl a single link |

## Notes

- The site has no login. Anyone with the address can add links and queue a refresh,
  which is fine for family use but worth locking down before sharing widely.
- Prices are only read from structured data or price elements on the page. If a shop
  changes its layout the crawler reports it rather than guessing, so a wrong price
  never ends up in the history.
