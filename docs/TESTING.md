# Release test checklist

Run this on every PR that touches the UI, and on production after each deploy.
Check each item at **390px wide (phone)** and **1440px wide (desktop)**, in **light and dark** mode.

## 1. Landing page (logged out)
- [ ] Header logo shows the full "PriceTracker" wordmark on phone and desktop.
- [ ] "Create a free account", "Sign in" and "Try the demo" all go somewhere valid (no 404).
- [ ] No text block wraps to one or two words per line.

## 2. Demo mode
- [ ] "Try the demo" opens the demo dashboard.
- [ ] Clicking the logo returns to the landing page.
- [ ] Opening the site URL in a new tab after a demo visit still lets the user reach the landing page (exit demo / short demo session).
- [ ] Yellow demo banner spans the full width on phone and does not push the logo or icons around.
- [ ] No Edit, Manage, search box, or "Alerts & profile"; `/manage` and `/account` send the user back to `/`.
- [ ] Every write API returns 403 `demo_read_only` (including `POST /api/search`).

## 3. Dashboard cards (phone)
- [ ] Summary cards such as "3 at target / View ready-to-buy items" fill the row width; text is not squeezed into a narrow column.
- [ ] Product cards: price, retailer, and "Checked" date line up and do not overflow.
- [ ] Products with no thumbnail show a placeholder, not a gap or broken image.

## 4. Price chart
- [ ] A loading skeleton shows immediately when a card is expanded (no large blank area).
- [ ] The Y axis has price labels; the all-time low and the current price are labelled.
- [ ] The chart fills the card width on phone; date labels line up with the chart ends.
- [ ] The latest point equals the product's current price (`insight.currentPrice`).

## 5. Normal account (when a test login is available)
- [ ] Add a product and a link, edit the target price, delete them.
- [ ] Preferences save and reload.

## 6. Data safety
- [ ] `price_history` row count is the same before and after any migration.
- [ ] anon, authenticated and service_role have no TRUNCATE on any public table.

## Screenshots
`node scripts/mobile-shots.mjs` captures the public pages at 390px and 1440px, light and dark, into `/tmp/shots/`.
