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

type PriceInsightResponse = {
  product: { id: string; name: string; targetPrice: number | null };
  range: { days: number; from: string; to: string };
  lowest: PricePoint[];          // lowest price across links over time (step line), ascending
  links: Array<{
    linkId: string; retailer: string; url: string; stockStatus: string;
    points: PricePoint[];        // raw observations for this link, ascending
    stats: LinkStats | null;     // from the price_link_stats view
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
    | 'below_median_90d' | 'below_median_30d' | 'not_below_median' | 'all_time_low'>;
  currentPrice: number | null;
  allTimeLow: PricePoint | null;
  isAllTimeLow: boolean;
  median30d: number | null;
  median90d: number | null;
  discountVsMedian90d: number | null; // 0.12 = 12% below the 90-day median
  sampleCount: number;                // daily samples in the last 90 days
  lastDrop: { at; from; to } | null;
  raise: { at; from; to } | null;     // set when verdict = fake_discount
};
```

## Verdict rules (`src/lib/priceInsight.ts`, constants in `INSIGHT_RULES`)

The verdict runs on the product's lowest price across links. Its input is
already one sample per link per UTC day: the day's **minimum** price from
`price_link_daily`, except that each link's newest day uses its live
`current_price` from `price_link_stats`. So the latest point always equals
`insight.currentPrice`, and an intraday dip that has since ended doesn't count
as the current price. The rules were written for one price per UTC day, so
they apply unchanged: sample counts are days, the raise/drop checks compare
day-to-day, and the medians use the daily prices before today's. (A daily min
can make a past day look slightly cheaper than its close, which makes
`real_discount` marginally harder to reach, never easier.)

1. **insufficient_data**: fewer than 5 daily samples in 90 days
   (`too_few_samples`), or history spans less than 7 days (`history_too_short`).
2. **fake_discount** (`raised_before_drop`): the current price comes from the
   latest drop, and in the 14 days before that drop the price went up by at
   least 5%. The drop also lands no lower than 2% under the price before the
   raise. In short, it was raised and then "discounted" back.
3. **real_discount**: the current price is at least 5% below the 90-day
   median **and** at least 5% below the 30-day median.
4. **no_discount**: anything else (`not_below_median`). `below_median_90d`
   may still appear when only the 90-day check passes.

`all_time_low` is added to `reasons` whenever the current price is at or below
the all-time low.

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
