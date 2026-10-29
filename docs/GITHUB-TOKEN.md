# GitHub token for the "refresh" button

The website's `/api/refresh` endpoint starts the crawler workflow
(`.github/workflows/crawl-prices.yml`) via GitHub's `workflow_dispatch` API.
All of that code lives in `src/lib/github/dispatch.ts`. It needs a token that can
do exactly one thing: run workflows in **28CN/PriceTracker**.

## Minimal permissions

Use a **fine-grained personal access token**, not a classic token with the `workflow` scope.

| Setting | Value |
| --- | --- |
| Resource owner | `28CN` |
| Repository access | **Only select repositories** → `28CN/PriceTracker` |
| Repository permissions → Actions | **Read and write** |
| Repository permissions → Metadata | **Read-only** (added automatically) |
| Everything else | No access |

## Create the token

1. Sign in to GitHub as `28CN` and open
   <https://github.com/settings/personal-access-tokens/new>
   (Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token).
2. **Token name:** `pricetracker-vercel-dispatch`. **Expiration:** 90 days (or your preference; put a reminder in your calendar).
3. **Resource owner:** `28CN`.
4. **Repository access:** choose *Only select repositories* and pick `28CN/PriceTracker`.
5. **Permissions → Repository permissions:** set **Actions** to *Read and write*. Leave
   **Metadata** at *Read-only*. Do not grant anything else (no Contents, no Workflows, no account permissions).
6. Click **Generate token** and copy it (starts with `github_pat_`). It is shown only once.

## Replace `GITHUB_TOKEN` on Vercel

1. Open the Vercel dashboard → project **pricetracker-au** → **Settings → Environment Variables**.
2. Find `GITHUB_TOKEN`, click **⋯ → Edit**, paste the new token, keep it marked as
   **Sensitive**, and apply it to **Production** (and Preview if you want previews to dispatch).
3. Check the other values: `GITHUB_OWNER=28CN`, `GITHUB_REPO=PriceTracker`,
   `GITHUB_WORKFLOW_ID=crawl-prices.yml`, `GITHUB_REF=main`.
4. **Deployments** → latest Production deployment → **⋯ → Redeploy** so the new value is used.
5. Test: open the site, press refresh on a product, then confirm a new "crawl-prices" run
   appears under <https://github.com/28CN/PriceTracker/actions>.
6. Revoke the old token: <https://github.com/settings/tokens> (classic) or
   <https://github.com/settings/personal-access-tokens> (fine-grained) → Delete.

Before it expires, repeat steps 1–6 (GitHub can also *Regenerate* the token with the same settings).

## Behaviour

- Missing variables: the refresh is only queued in `crawl_jobs`; the next scheduled crawl picks it up.
- Invalid values, HTTP errors, network errors and timeouts (8 s) are logged without the token
  and the user still sees "queued".
