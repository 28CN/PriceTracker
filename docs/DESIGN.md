# PriceTracker design principles

Visual tokens, type and components live in [VISUAL-DESIGN-SYSTEM.md](VISUAL-DESIGN-SYSTEM.md).
This file covers how screens communicate. Read it before adding or rewriting any UI copy.

## Minimal copy

Layout, visual hierarchy, spacing and one clear primary action should explain a screen.
Text is a last resort, not the default.

### Rules

1. **Structure before words.** Use heading size, grouping, order and spacing to show what matters.
   If a section needs a paragraph to be understood, fix the structure first.
2. **No filler copy by default.** Do not add:
   - eyebrows or secondary labels that repeat the heading;
   - subtitles that restate the title;
   - slogans or marketing taglines;
   - tutorial paragraphs or "how this works" text under each section;
   - helper text that describes what a clearly named control already says.
3. **One primary action per view.** It should be visually dominant and named with a verb that says
   what happens ("Add a product", "Save", "Make my own list"). Secondary actions are visibly quieter.
4. **Extra information goes behind an info icon.** When context is genuinely useful but not needed
   to act, use `InfoTip` (`src/components/InfoTip.tsx`) instead of always-visible secondary text.
   It must stay accessible:
   - a real `<button>` with an `aria-label`;
   - reachable and openable by keyboard (focus opens it, Escape closes it);
   - tooltip text linked with `aria-describedby` and `role="tooltip"`;
   - works by tap on touch screens.
5. **Accessibility is never traded for minimalism.** Keep visible form labels, accessible names on
   icon buttons, `aria-label`s on charts, and status messages (`role="status"`/errors).
   Removing visual text must not remove the accessible name.
6. **Consequences stay visible.** Destructive or irreversible actions (delete, payment, permanent
   changes, leaving with unsaved data) keep a clear, always-visible warning and a confirmation step
   that names what will be lost.
7. **Plain everyday words.** Write for someone who has never used the app, e.g. a 70-year-old
   shopper. Avoid jargon ("demo mode", "read-only", "crawl", "rows", "URL"). Prefer text buttons
   over icons whose meaning is ambiguous.
8. **First use must still be obvious.** After removing text, a first-time user must still know
   where to click next and what will happen when they do. Empty states show one action button,
   not instructions.

### Rewriting an existing screen

1. Remove redundant labels, subtitles and explanations.
2. Look at the screen fresh. If clarity dropped, improve the layout and the button wording first.
3. Only if that is not enough, add an `InfoTip`. Add always-visible text only for consequences
   or errors.

### Review checklist

- [ ] Every visible line of text either names something, is an action, or reports state/errors.
- [ ] No eyebrow, subtitle or helper line repeats what the heading or control already says.
- [ ] The primary action is the strongest element and its label says what happens.
- [ ] Optional context is in an `InfoTip`, not a paragraph.
- [ ] Form fields keep labels; icon-only buttons have `aria-label`.
- [ ] Destructive or irreversible actions show their consequence and ask to confirm.
- [ ] No technical jargon; a first-time user can tell what to do next.
- [ ] Checked at 390 px in light and dark themes.

## What the product is for

A person tracks a few products across Australian shops and wants the cheapest current price, the shop name, and the date of the last real check. The goal price is the number they hope to pay. It is called **Goal** everywhere, because Target is also a shop.

## Cards

Reading order: name, then price or state, then shop, then the last successful check, then Edit. The price sits in a column that is the same width on every card in the row (`12.5rem` once the card is at least 560px wide). Narrower cards, including a 280px column, stack that column underneath and keep it right-aligned, so the prices still share a right edge. Shop names, states, and dates wrap. The card grows. Nothing is cut off with an ellipsis.

One state at a time:

| What is true | What the card says |
| --- | --- |
| A fresh price | The price, the shop, and `Checked` plus the date |
| Only stale prices (older than a week) | The newest last price, muted, the shop, and `Last seen` plus the short date |
| Every shop is unavailable | **Unavailable** |
| A check is queued and there is no price | **Checking soon** |
| A check is running and there is no price | **Checking…** |
| No price and nothing is queued | **No price yet** |
| The shop is not one we check | **Not checked here**, and a link to the shop |

Stale prices (older than a week) are always shown directly in a muted colour with a `Last seen` date in Sydney time (day and month, adding the year only when it is not the current year), never hidden behind a click. Fresh prices always win **Cheapest** and the card headline; a stale price can never beat a fresh price, and if only stale prices exist the newest one leads. For example, if Shop A is $24 today and Shop B was $19 three weeks ago, the card shows $24 at Shop A; if Shop B ($19, Last seen 4 Nov) and Shop C ($21, Last seen 10 Nov) are both stale, the card shows $21 at Shop C muted with `Last seen 10 Nov`.

**Checking soon** is not a synonym for "we have no price". A missing date is not a promise. The date is the last successful observation, formatted in Sydney time with the year, and stored in a `<time datetime>` as well. The goal amount is written once on the card. The chart can still draw the goal as a line.

Edit is its own button. It does not sit on top of the price. A missing photo keeps a fixed box so the price does not jump when an image arrives.

## Usual price

Shelf prices rise permanently over time. Comparing today's price against a fixed 90-day median makes a permanent rise look inflated for months and makes the old shelf price look like a deal forever. Instead, each shop tracks its own **usual price** over time (`src/lib/usualPrice.ts`):

- **Baseline:** observations collapse to one check per Sydney calendar day (`Australia/Sydney`). The baseline is the most common price (mode, breaking ties to the higher non-sale price) over the last 8 weeks (56 days), falling back to the median when no price repeats. Shops with fewer than 3 Sydney-day checks use the latest price with low confidence and no shifts.
- **Asymmetric level shifts (with a 12-hour schedule-jitter allowance):**
  - **Upward shift:** a higher price that holds for at least 2 consecutive checks spanning at least 7 days (two separate weekly cycles) becomes the new usual price from the date it first appeared.
  - **Downward shift:** stricter because lower prices are usually promotions (1–2 week specials, sometimes up to 4 weeks). A lower price — whether a permanent cut or a revert after an earlier rise — becomes the new usual price only after holding for at least 3 consecutive checks spanning at least 28 days, dated to its first day.
- **Short dips and reverts:** 1–2 week specials stay deals and do not move the usual price. A brief rise that reverts causes no shift; a held rise that later holds back at the old price for 4+ weeks records a downward shift on the revert date.
- **Verdict and goal:** discount judgements compare the leading (cheapest fresh) shop's current price against that shop's current usual price. The user's **Goal** price is never changed automatically.

Worked example: a Matchbox car at Woolworths is $3.50 for 6 weeks, then $4.00 on 3 Nov and 10 Nov. Two consecutive weekly checks at $4.00 spanning 7 days move the usual price up to $4.00 from 3 Nov (shown as a dashed step line and `Usual price went up to $4.00 · 3 Nov` below the chart). When a $3.00 week arrives afterwards, it is judged against $4.00 as a real discount (25% below usual), not compared against the old $3.50.

## Search

Search splits into two groups inside one combobox so finding something you already track is instant and free, while live shop lookups stay inside tight quotas:

1. **On your list (instant, client-side):** as you type, your own tracked products are filtered in memory with `src/lib/searchMatch.ts` (normalisation, space-free compact matching so `hot wheels`, `hotwheels` and `Hot-Wheels` agree, simple singular/plural folding, word-prefix matching, and light Damerau-Levenshtein tolerance on tokens of 4+ characters). It matches the product title first, then the item's group name (a product called `Basic Car` in the group `Hotwheels` is found by `hotwheels`, and `matchbx` finds the `Matchbox` group), then shop names and the product words in its shop links (for example `hot wheels super rig` from a Coles link). Up to 5 matches show with thumbnail, shop and cheapest fresh price (or muted stale price with `Last seen <date>`). Selecting one jumps to `#p-<id>` and highlights the card briefly.
2. **Other shops (free cache while typing, paid live search on submit):** after typing 3 or more characters (debounced 350 ms), `GET /api/search?q=...` searches the shared `product_search_cache` fuzzily in TypeScript — including stale entries, labelled with their date (e.g. `Prices from 5 Nov`). Pressing Enter (with no option highlighted) or clicking **Search shops** runs `POST /api/search` for a live Google Shopping lookup inside existing quotas. Cache keys use the compact normalised form (`q:<compact>`) so spacing variants share one entry. Shop results already on your list (by URL or near-identical name) show an **On your list** mark.

The shared cache only holds what someone has searched live before. On 23 Nov 2026 it held one search (`lego classic`, 12 results) plus two shop lists, so `hotwheels` or `matchbox` correctly finds nothing there until someone presses **Search shops** for it.

**This week, usual price went up:** a rise is listed while its new price first appeared within the last 28 days and is still the usual price. A rise needs about a week of checks before it counts, so listing only rises confirmed in the last 7 days would show each one for a single week, and not at all if a weekly check was missed. The row shows the date the new price started.

**Why no `pg_trgm` migration:** production currently has 21 products, 69 links, and 3 `product_search_cache` rows (22 cached results), and `pg_trgm` is not installed. At this data size, in-memory TypeScript matching in `src/lib/searchMatch.ts` gives zero-network own-list filtering, shares one ranking/fuzzy implementation across client and cache, and avoids a database extension migration that would add maintenance cost without a speed benefit.

## Landing

One headline, then **Start tracking**, **View example**, and **Sign in**. The sample card is labelled **Example** and is not anyone's list. The looping kangaroo was removed: it kept animating and competed with the button. A single price line explains the idea without moving.

## Motion

Cards and the deal dialog fade in briefly. The dialog is a native `<dialog>` opened with `showModal()`, so Escape, focus, and the backdrop come from the browser. Scroll gestures inside it do not chain to the page. `prefers-reduced-motion: reduce` turns the animation off.

## Rejected

- Truncating shop names to 140px, or hiding them on a phone. The name is the point of the card.
- Saying **Checking soon** whenever a date is missing.
- Putting the owner's real list on the public home page and calling it popular.
- A shared cache of private pages. A faster page that shows the wrong person's prices is not faster in any sense that matters.
