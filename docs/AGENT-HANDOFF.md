# Agent handoff

For the next coding agent (or person) picking up PriceTracker. Read `AGENTS.md`
first; this file adds the history, where things run, and what to ask the owner for.

The repository is public. Never put secrets, passwords, email addresses or
vault ids in this file, in commits, or in pull request text.

## Starting a session

1. `git pull` on `main`.
2. Read the top of `docs/CHANGELOG.md`: owner and Antigravity edits land there too.
3. `git log --oneline <last known SHA>..HEAD` and `git diff --stat <last known SHA>..HEAD`.
   Open only what changed; the rest is as described in this file.
4. Finish with a CHANGELOG line and the SHA you ended at.

## History

All work lands on `main` through squash-merged pull requests.

| PRs | What changed |
| --- | --- |
| #2 | One site URL for every absolute link (`NEXT_PUBLIC_SITE_URL`, `src/lib/siteUrl.ts`). |
| #3 | `/api/thumb` fetches images through `safeFetch` (SSRF fix). |
| #4, #5 | Schema built only from migrations, CI schema-drift check, old public RLS policies removed. |
| #6 | One crawl workflow, narrower GitHub token permissions. |
| #7, #16, #23 | Read-only demo account behind **View example**, one-hour demo session, `POST /demo/exit`. |
| #8, #18, #19, #20 | Hardening: `SECURITY DEFINER` RPCs limited to `service_role`, explicit table `GRANT`s, `TRUNCATE`/`REFERENCES`/`TRIGGER` revoked from `anon`/`authenticated`, owner-read policy for `INSERT ... RETURNING`. |
| #9, #10 | Email behind a feature flag, off until a sending domain is verified. |
| #11 | Tests and CI: Vitest, pytest, pgTAP, ESLint, Node 22. |
| #12, #13, #17, #24, #25 | Price trend chart and real-discount insight, promo periods per shop. |
| #14, #15, #21 | README, screenshots, release test checklist. |
| #22 | Mobile polish: top bar, demo banner, chart readability. |
| #26 to #31 | Minimal UI copy, card and chart refresh, search and track, motion polish. |
| #32 | Card price alignment, shorter landing, one query for latest prices, functions pinned to `hnd1`. |
| #33 | Stale prices shown muted with `Last seen`, per-shop usual price that follows lasting rises, desktop dashboard (summary strip, This week panel, side detail), search rebuild. |
| #34 | Kangaroo hero, calmer style, steadier dashboard, this handoff document. |
| #35 to #45 | Search and account polish, one-click add from shop links. |
| #46 | Main navigation (top on desktop, bottom bar on phones) and a public About page. |
| #47 | Compare: your list at Coles vs Woolworths, with unit prices. |
| #48, #49 | Deals page from OzBargain shop feeds (GitHub Action every 6 hours), thumbnails and was/now saving. |
| #50 | Home shortcut cards, CHANGELOG and the Antigravity working guide. |
| #51 | Kangaroo hops in on first load, shop links on Deals. |
| #52 | Guide (`/about`), case study at `/about/built`, `/install` page (PWA install button, never auto-prompts). |

PR #1 (beta shop search page) is still open and not part of `main`.

## Architecture pointers

- `docs/ARCHITECTURE.md`: request path, prices, checks, search, what is private.
- `docs/DATABASE.md` and `supabase/migrations/`: schema, RLS, views
  (`price_link_daily`, `price_link_stats`, latest prices).
- `docs/DESIGN.md`: UI rules, cards, usual price, search, landing.
- `docs/PRICE_INSIGHT.md`: the deal verdict. `docs/PERFORMANCE.md`: measurements.
- `docs/TESTING.md`: test layers and the screenshot routine.
- Pure logic lives in `src/lib/*.ts` with tests beside it (`cardState`,
  `usualPrice`, `priceInsight`, `overview`, `searchMatch`, `trackedSearch`).
- API routes: `src/app/api/*`. Server timing helper: `src/lib/serverTiming.ts`.
- Crawler: `crawler/main.py` (Python, Playwright).
- The **View example** list is the `demo-shop` account's real products in
  production, not static fixtures. Everyday Australian pantry and household
  staples were added in `supabase/migrations/202611240001_demo_au_staples.sql`
  so the scheduled GitHub Actions crawl can record real price history.
  Those new links use Coles and Woolworths, which the cloud run can reach.
  Kmart, Target, Big W, Toymate, Bunnings and Chemist Warehouse are skipped
  in CI and are better left to the local crawl.

## Where things run

- **Website**: Vercel project `pricetracker-au`, team `shingsino-2481s-projects`,
  production at `https://pricetracker-au.vercel.app`. Functions run in `hnd1`
  (Tokyo), set in `vercel.json`. Every push to a branch gets a preview deployment;
  previews sit behind Vercel Authentication.
- **Database and auth**: Supabase project ref `yvvreaqbxzcemvgimbpa`, region Tokyo.
- **Weekly crawl in the cloud**: GitHub Actions `.github/workflows/crawl-prices.yml`
  (scheduled, also started by the refresh button through `workflow_dispatch`).
  Some shops block cloud runners.
- **Local crawl**: a Windows scheduled task on the owner's computer runs
  `scripts/crawl-background.ps1` for the shops the cloud run cannot reach.
  After changing the task or its scripts, `scripts/register-tasks.ps1` must be
  re-run from an administrator PowerShell. Details: `scripts/定时任务说明.txt`.
- **CI**: `.github/workflows/ci.yml` (typecheck, lint, tests, build, Python tests,
  schema drift).

## Rules that are easy to break

- Never delete or truncate rows in `price_history`.
- Migrations only as new files with explicit `GRANT`s and RLS. The owner applies
  them to production before the pull request is merged. Agents do not apply them.
- Email notifications stay off (`EMAIL_ENABLED`, `NEXT_PUBLIC_EMAIL_ENABLED`)
  until the site has a custom domain with a verified sender.
- Squash-merge only, done by the owner. Commit identity as in `AGENTS.md`.

## Known open items

- The `Server-Timing` header reads empty on the signed-in `/` page.
- The local crawler uses too much CPU and memory on the owner's computer, so it
  is often skipped and some prices go stale. The owner is fixing it on that machine.
- Preview deployments only: an `OPTIONS` request from the Vercel toolbar returns 400.
  Production is not affected.

## What to ask the owner for

Ask; never guess, and never commit what you receive.

- [ ] A fine-grained GitHub token limited to `28CN/PriceTracker` with
      Contents, Pull requests and Workflows permissions.
- [ ] Supabase access: a dashboard login, or a personal access token or service
      role key. Keep keys in a local `.env.local` only.
- [ ] Vercel access (login or token) for environment variables, logs and preview
      share links.
- [ ] The test accounts (admin and personal). She keeps them in her password
      vault. Ask for them each time you need them.
- [ ] A SerpApi key, only if you work on live shop search.

Environment variable names (values come from the owner) are listed in
`.env.local.example`; copy it to `.env.local`. The main ones:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `NEXT_PUBLIC_SITE_URL`,
`AUTH_RATE_LIMIT_PEPPER`, `DEMO_ACCOUNT_PASSWORD`, `SERPAPI_API_KEY`,
`GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_WORKFLOW_ID`, `GITHUB_REF`,
`EMAIL_ENABLED`, `NEXT_PUBLIC_EMAIL_ENABLED`, `RESEND_API_KEY`,
`RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`, `EMAIL_WORKER_SECRET`.
GitHub Actions uses the secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`,
optional `CRAWL_PROXY*`, and the variable `SITE_URL`.
