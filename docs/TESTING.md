# Testing

## Automated

```bash
npm test          # Vitest
npx tsc --noEmit
npm run lint
```

On 15 November 2026, in this pass: Vitest 132 tests passed, `tsc --noEmit` passed, and ESLint passed on the files that changed. `next build` completed.

Card states are pure functions in `src/lib/cardState.test.ts`. The in-flight share is in `src/lib/inflight.test.ts` (same key shares one promise and is forgotten afterwards; different keys do not share).

## Card layout

Fixture page: `/preview/cards` (not linked from the nav, `noindex`). Sample products only.

Checked in headless Chrome, light and dark, viewport widths 320, 375, 768, 1024, and 1440. At each width the price column's right edge was the same on the first six cards (spread 0px), shop and state text did not overflow its box, and the page did not scroll sideways. Screenshots at 390 and 1440, light and dark, are in the pull request.

The same page also renders columns of 280, 360, and 520px. Those were included in the 1440 screenshot. A separate numeric pass of only those nested columns was not recorded.

Not run: 200% text spacing, 400% zoom on a 1280px desktop, NVDA or VoiceOver, Safari, Firefox, and a manual keyboard pass beyond what the native dialog provides (Escape, focus return). Mark those not run.

## Landing

Headless Chrome, local production build, 390 and 1440, light and dark. The first screen shows the headline, **Start tracking**, **View example**, and **Sign in**. The sample is labelled **Example**.

Production (the previous deployment) was screenshotted the same way for the before shots. It still shows **Create a free account**, **See an example**, the kangaroo, and **Add a product**.

## Search

Covered by `src/app/api/search/route.test.ts` for the quota, cache, and own-list rules. The new button labels (**Adding…**, **Tracked**, **Listed price**, **View on my list**) were not driven in a browser with a live search, because that spends quota. Not run against a live provider in this pass.

## Performance

See [PERFORMANCE.md](PERFORMANCE.md). Production `/` and `/login` were timed. A signed-in list and a real chart were not.

## Data

The new migration grants `SELECT` on five `crawl_jobs` columns (`id`, `product_id`, `link_id`, `status`, `created_at`) to `authenticated`, not the whole table, and `EXECUTE` on `latest_link_prices` to `anon`, `authenticated`, and `service_role`. It does not grant `TRUNCATE`. It does not delete `price_history`. Apply it to production before merge. Schema snapshots were updated to the expected policy, index, and privilege lines. If CI's drift check disagrees with the exact Postgres text, fix the snapshot in that check. Not run locally: `supabase test db` (no local database in this environment).

## Demo and data checks (from the previous list)

- [ ] **View example** opens the sample list. The banner says it is a sample. Writes return 403.
- [ ] Logo from the sample returns to the landing page.
- [ ] `price_history` row count is unchanged by the migration.
- [ ] anon, authenticated, and service_role have no TRUNCATE on any public table.

## Release checks still open

- [ ] Sign in with a real account and confirm the list appears without the old multi-second wait.
- [ ] Open a chart twice and confirm the second open is quicker, and that a second account does not see the first account's chart.
- [ ] Keyboard: Tab through a card, Edit, Show last price, and the deal dialog. Focus returns to the button that opened the dialog.
- [ ] Phone: 390px light and dark on the deployed site, not only headless.
