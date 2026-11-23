# Price insight API (for PriceChart.tsx)

`GET /api/products/:id/price-insight?days=180`

Read-only. Uses the signed-in user's Supabase session, so RLS decides
visibility: your own products, plus products on public watchlists. The demo
account can read it. Writes are never issued.

| Status | When |
| --- | --- |
| 200 | `PriceInsightResponse` |
| 400 | `id` is not a UUID, or `days` is not an integer from 1 to 365 |
| 401 | not signed in |
| 404 | product does not exist or RLS hides it |
| 500 | database error (message is generic) |

`days` (default 180) only trims the chart series. The verdict always looks at
the last 90 days, and `insight.allTimeLow` / `links[].stats` use full history.

Types are exported from `src/app/api/products/[id]/price-insight/route.ts`
(`PriceInsightResponse`, `LinkStats`) and `src/lib/priceInsight.ts`
(`PriceInsight`, `Verdict`, `PricePoint`).

```ts
type PricePoint = { at: string /* ISO */; price: number };

type UsualPriceResult = {
  series: Array<{ from: string /* ISO */; price: number }>;
  currentUsual: number | null;
  shifts: Array<{ at: string /* ISO */; from: number; to: number; direction: 'up' | 'down' }>;
  lowConfidence: boolean;
};

type PriceInsightResponse = {
  product: { id: string; name: string; targetPrice: number | null };
  range: { days: number; from: string; to: string };
  lowest: PricePoint[];          // lowest price across links over time (step line), ascending
  leadingLinkId: string | null;  // cheapest fresh shop (or newest stale) used for verdict & chart usual line
  links: Array<{
    linkId: string; retailer: string; url: string; stockStatus: string;
    points: PricePoint[];        // daily observations for this link, ascending
    stats: LinkStats | null;     // from the price_link_stats view
    promo: PromoCycle;
    periods: PromoPeriod[];
    coverage: PromoCoverage;
    usual: UsualPriceResult;     // per-shop usual-price step series and detected level shifts
  }>;
  insight: PriceInsight;
};

type LinkStats = {
  currentPrice; lastSeenAt; allTimeLow; allTimeLowAt;
  low30d; avg30d; high30d; low90d; avg90d; high90d;  // numbers or null
  sampleCount; sampleCount90d;                        // numbers
  lastChangeAt;                                       // ISO or null
};

type PriceInsight = {
  verdict: 'insufficient_data' | 'fake_discount' | 'real_discount' | 'no_discount';
  reasons: Array<'too_few_samples' | 'history_too_short' | 'raised_before_drop'
    | 'below_usual' | 'not_below_usual' | 'all_time_low'>;
  currentPrice: number | null;
  allTimeLow: PricePoint | null;
  isAllTimeLow: boolean;
  usualPrice: number | null;          // current usual price of the leading shop
  discountVsUsual: number | null;     // 0.25 = 25% below usualPrice
  median30d: number | null;           // reference only
  median90d: number | null;           // reference only
  discountVsMedian90d: number | null; // reference only
  sampleCount: number;                // daily samples in the last 90 days
  lastDrop: { at; from; to } | null;
  raise: { at; from; to } | null;     // set when verdict = fake_discount
};
```

## Verdict rules (`src/lib/priceInsight.ts` & `src/lib/usualPrice.ts`)

Per-shop usual prices are computed server-side from the observations already
fetched (no extra database queries). The verdict runs on the leading shop
(`leadingLinkId`: cheapest fresh shop, or newest stale shop if none are fresh),
using its daily series from `price_link_daily` patched with live
`current_price` on the newest day.

1. **insufficient_data**: fewer than 5 daily samples in 90 days
   (`too_few_samples`), history spans less than 7 days (`history_too_short`),
   or no usual price can be determined.
2. **fake_discount** (`raised_before_drop`): the current price comes from the
   latest drop, and in the 14 days before that drop the price went up by at
   least 5%. The drop also lands no lower than 2% under the price before the
   raise. In short, it was raised and then "discounted" back.
3. **real_discount** (`below_usual`): the current price is at least 5% below
   the leading shop's current **usual price** (`usualPrice`), computed on
   Sydney calendar days (`Australia/Sydney`). Level shifts are asymmetric (with
   a 12-hour schedule-jitter allowance): rises confirm after `>= 2` consecutive
   checks spanning `>= 7` days, while downward shifts (including reverts after
   an earlier rise) require `>= 3` consecutive checks spanning `>= 28` days so
   1–2 week promotions do not lower the usual price.
4. **no_discount** (`not_below_usual`): anything else.

`all_time_low` is added to `reasons` whenever the current price is at or below
the all-time low. `median30d`, `median90d`, and `discountVsMedian90d` remain in
the response for reference, while the verdict and chart "Usual" / "% off"
displays use `usualPrice` and `discountVsUsual`. The product's **Goal** price
is never modified automatically.

## Database

`public.price_link_stats` (migration `202610290009`) is a `security_invoker`
view over `price_history` + `tracked_links`, one row per link. `anon` has no
access. It never modifies `price_history`. The all-time low always comes from
this view (full history), never from the charted window.

`public.price_link_daily` (migration `202610290010`) is a `security_invoker`
view with one row per link per UTC day: `link_id, product_id, day, min_price,
last_at, samples`. Same grants (`authenticated`, `service_role`; no `anon`),
read-only. The API reads it for `max(days, 90)` days, paging with `.range()`
1000 rows at a time (the PostgREST cap) until a short page, ordered by
`(day, link_id)`. Past 20,000 daily rows it returns 500 rather than a
truncated series. Raw `price_history` rows are never pulled. pgTAP:
`supabase/tests/price_insight.test.sql`.
