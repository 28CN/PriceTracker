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
| The last price is more than a week old | **Show last price**, then the saved amount labelled **Last saved price** |
| Every shop is unavailable | **Unavailable** |
| A check is queued and there is no price | **Checking soon** |
| A check is running and there is no price | **Checking…** |
| No price and nothing is queued | **No price yet** |
| The shop is not one we check | **Not checked here**, and a link to the shop |

**Checking soon** is not a synonym for "we have no price". A missing date is not a promise. The date is the last successful observation, formatted in Sydney time with the year, and stored in a `<time datetime>` as well. The goal amount is written once on the card. The chart can still draw the goal as a line.

Edit is its own button. It does not sit on top of the price. A missing photo keeps a fixed box so the price does not jump when an image arrives.

## Landing

One headline, then **Start tracking**, **View example**, and **Sign in**. The sample card is labelled **Example** and is not anyone's list. The looping kangaroo was removed: it kept animating and competed with the button. A single price line explains the idea without moving.

## Motion

Cards and the deal dialog fade in briefly. The dialog is a native `<dialog>` opened with `showModal()`, so Escape, focus, and the backdrop come from the browser. Scroll gestures inside it do not chain to the page. `prefers-reduced-motion: reduce` turns the animation off.

## Rejected

- Truncating shop names to 140px, or hiding them on a phone. The name is the point of the card.
- Saying **Checking soon** whenever a date is missing.
- Putting the owner's real list on the public home page and calling it popular.
- A shared cache of private pages. A faster page that shows the wrong person's prices is not faster in any sense that matters.
