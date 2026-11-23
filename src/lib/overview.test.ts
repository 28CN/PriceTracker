import { describe, expect, it } from 'vitest';

import {
  computeOverview,
  OVERVIEW_WEEKS,
  type OverviewDailyRow,
  type OverviewProduct
} from './overview';

const DAY_MS = 86_400_000;
const NOW = Date.parse('2026-11-23T02:00:00.000Z');

function row(linkId: string, daysAgo: number, price: number): OverviewDailyRow {
  const d = new Date(NOW - daysAgo * DAY_MS);
  return {
    linkId,
    day: d.toISOString().slice(0, 10),
    minPrice: price,
    lastAt: d.toISOString()
  };
}

function product(
  id: string,
  name: string,
  targetPrice: number | null,
  links: Array<{ id: string; retailer: string; isActive?: boolean; stockStatus?: 'in_stock' | 'unavailable' | 'unknown' }>
): OverviewProduct {
  return {
    id,
    name,
    targetPrice,
    links: links.map((l) => ({
      id: l.id,
      retailer: l.retailer,
      isActive: l.isActive ?? true,
      stockStatus: l.stockStatus ?? 'in_stock'
    }))
  };
}

describe('computeOverview', () => {
  it('handles empty products and empty daily rows cleanly', () => {
    const empty = computeOverview([], [], { now: NOW });
    expect(empty).toEqual({
      trackedCount: 0,
      belowGoalCount: 0,
      droppedThisWeekCount: 0,
      sparklines: {
        tracked: Array(OVERVIEW_WEEKS).fill(0),
        belowGoal: Array(OVERVIEW_WEEKS).fill(0),
        dropped: Array(OVERVIEW_WEEKS).fill(0)
      },
      biggestDrops: [],
      newlyBelowGoal: [],
      usualPriceRises: []
    });

    const noHistory = computeOverview(
      [product('p1', 'Kettle', 50, [{ id: 'l1', retailer: 'Kmart' }])],
      [],
      { now: NOW }
    );
    expect(noHistory.trackedCount).toBe(1);
    expect(noHistory.belowGoalCount).toBe(0);
    expect(noHistory.droppedThisWeekCount).toBe(0);
    expect(noHistory.biggestDrops).toEqual([]);
    expect(noHistory.newlyBelowGoal).toEqual([]);
    expect(noHistory.usualPriceRises).toEqual([]);
    expect(noHistory.sparklines.tracked).toHaveLength(8);
  });

  it('finds drops vs last week, ignores stale and unavailable links, and ranks top 5', () => {
    const products: OverviewProduct[] = [
      product('p1', 'Coffee beans', 20, [
        { id: 'l1a', retailer: 'Coles' },
        { id: 'l1b', retailer: 'Woolworths' }
      ]),
      product('p2', 'Olive oil', 15, [{ id: 'l2', retailer: 'Woolworths' }]),
      product('p3', 'Stale item', 10, [{ id: 'l3', retailer: 'Kmart' }]),
      product('p4', 'Out of stock', 10, [{ id: 'l4', retailer: 'Target', stockStatus: 'unavailable' }]),
      product('p5', 'Paused shop', 10, [{ id: 'l5', retailer: 'Big W', isActive: false }])
    ];

    const rows: OverviewDailyRow[] = [
      // p1: Coles was $30 last week, Woolworths is $21 this week (-30%).
      row('l1a', 10, 30),
      row('l1b', 2, 21),
      // p2: Woolworths was $20 last week, $10 this week (-50%).
      row('l2', 9, 20),
      row('l2', 1, 10),
      // p3: only has observations 18d and 10d ago (stale this week -> not counted).
      row('l3', 18, 20),
      row('l3', 10, 12),
      // p4: unavailable this week -> ignored for current week.
      row('l4', 10, 20),
      row('l4', 1, 8),
      // p5: inactive link -> ignored.
      row('l5', 10, 20),
      row('l5', 1, 8)
    ];

    const res = computeOverview(products, rows, { now: NOW });
    expect(res.trackedCount).toBe(5);
    expect(res.droppedThisWeekCount).toBe(2);
    // p2 (-50%) ranks ahead of p1 (-30%).
    expect(res.biggestDrops).toEqual([
      {
        productId: 'p2',
        linkId: 'l2',
        name: 'Olive oil',
        retailer: 'Woolworths',
        oldPrice: 20,
        newPrice: 10
      },
      {
        productId: 'p1',
        linkId: 'l1b',
        name: 'Coffee beans',
        retailer: 'Woolworths',
        oldPrice: 30,
        newPrice: 21
      }
    ]);
    // Last point of dropped sparkline matches droppedThisWeekCount.
    expect(res.sparklines.dropped[7]).toBe(2);
  });

  it('caps each group at 5 entries even when more items qualify', () => {
    const products = Array.from({ length: 7 }, (_, i) =>
      product(`p${i}`, `Item ${i}`, 50, [{ id: `l${i}`, retailer: 'Coles' }])
    );
    const rows: OverviewDailyRow[] = [];
    for (let i = 0; i < 7; i += 1) {
      rows.push(row(`l${i}`, 10, 100));
      rows.push(row(`l${i}`, 1, 40 - i));
    }

    const res = computeOverview(products, rows, { now: NOW });
    expect(res.droppedThisWeekCount).toBe(7);
    expect(res.biggestDrops).toHaveLength(5);
    expect(res.newlyBelowGoal).toHaveLength(5);
    expect(res.biggestDrops[0].productId).toBe('p6');
  });

  it('lists only items that crossed from above goal last week to at/below goal this week', () => {
    const products = [
      product('newly', 'Dishwasher tablets', 25, [{ id: 'l-new', retailer: 'Coles' }]),
      product('already', 'Laundry liquid', 25, [{ id: 'l-old', retailer: 'Woolworths' }]),
      product('still-high', 'Espresso pods', 15, [{ id: 'l-hi', retailer: 'Target' }])
    ];

    const rows = [
      // newly: $32 last week (> 25) -> $22 this week (<= 25)
      row('l-new', 10, 32),
      row('l-new', 1, 22),
      // already: $24 last week (already <= 25) -> $20 this week
      row('l-old', 10, 24),
      row('l-old', 1, 20),
      // still-high: $20 last week -> $18 this week (still > 15)
      row('l-hi', 10, 20),
      row('l-hi', 1, 18)
    ];

    const res = computeOverview(products, rows, { now: NOW });
    expect(res.belowGoalCount).toBe(2);
    expect(res.sparklines.belowGoal[6]).toBe(1);
    expect(res.sparklines.belowGoal[7]).toBe(2);
    expect(res.newlyBelowGoal).toEqual([
      {
        productId: 'newly',
        linkId: 'l-new',
        name: 'Dishwasher tablets',
        retailer: 'Coles',
        oldPrice: 32,
        newPrice: 22
      }
    ]);
  });

  it('lists recent usual-price rises and skips old or brief rises', () => {
    const products = [
      product('confirmed-now', 'Matchbox car', null, [{ id: 'l-up', retailer: 'Woolworths' }]),
      product('old-shift', 'Toothpaste', null, [{ id: 'l-old', retailer: 'Coles' }]),
      product('brief-rise', 'Tim Tams', null, [{ id: 'l-brief', retailer: 'Woolworths' }])
    ];

    const rows: OverviewDailyRow[] = [
      // confirmed-now: $3.50 for 5 weeks, then $4.00 at day -8 and day -1 (2 checks spanning 7d, confirmed this week!)
      row('l-up', 43, 3.5),
      row('l-up', 36, 3.5),
      row('l-up', 29, 3.5),
      row('l-up', 22, 3.5),
      row('l-up', 15, 3.5),
      row('l-up', 8, 4.0),
      row('l-up', 1, 4.0),

      // old-shift: $6.00 first seen 40 days ago, outside the 28-day window
      row('l-old', 60, 5.0),
      row('l-old', 55, 5.0),
      row('l-old', 50, 5.0),
      row('l-old', 40, 6.0),
      row('l-old', 33, 6.0),
      row('l-old', 26, 6.0),
      row('l-old', 12, 6.0),
      row('l-old', 2, 6.0),

      // brief-rise: only 1 check at $5.00 so usual price has NOT shifted yet
      row('l-brief', 28, 4.0),
      row('l-brief', 21, 4.0),
      row('l-brief', 14, 4.0),
      row('l-brief', 1, 5.0)
    ];

    const res = computeOverview(products, rows, { now: NOW });
    expect(res.usualPriceRises).toHaveLength(1);
    expect(res.usualPriceRises[0]).toMatchObject({
      productId: 'confirmed-now',
      linkId: 'l-up',
      name: 'Matchbox car',
      retailer: 'Woolworths',
      oldPrice: 3.5,
      newPrice: 4.0
    });
  });

  it('keeps a rise confirmed two weeks ago when its new price first appeared within 28 days', () => {
    // Shape of the real Power Grab history at Woolworths: $3.50 for weeks, then
    // $4.00 from 21 days ago, checked several times since. Confirmed 14 days ago.
    const products = [product('power-grab', 'Power Grab', 3, [{ id: 'l-pg', retailer: 'Woolworths' }])];
    const rows: OverviewDailyRow[] = [
      ...[60, 57, 53, 50, 46, 43, 39, 36, 31, 28, 25].map((d) => row('l-pg', d, 3.5)),
      ...[21, 19, 18, 14, 11, 7, 4].map((d) => row('l-pg', d, 4.0))
    ];
    const res = computeOverview(products, rows, { now: NOW });
    expect(res.usualPriceRises).toHaveLength(1);
    expect(res.usualPriceRises[0]).toMatchObject({ productId: 'power-grab', oldPrice: 3.5, newPrice: 4.0 });
    expect(res.usualPriceRises[0].at.slice(0, 10)).toBe(row('l-pg', 21, 4).day);
  });

  it('produces 8-point price index sparkline reflecting weekly price changes', () => {
    const products = [product('p1', 'Milk', null, [{ id: 'l1', retailer: 'Coles' }])];
    const rows = [
      row('l1', 50, 10), // week 0 -> 100
      row('l1', 43, 10), // week 1 -> 100
      row('l1', 36, 9),  // week 2 -> 90
      row('l1', 29, 9),  // week 3 -> 90
      row('l1', 22, 8),  // week 4 -> 80
      row('l1', 15, 8),  // week 5 -> 80
      row('l1', 8, 10),  // week 6 -> 100
      row('l1', 1, 7)    // week 7 -> 70
    ];

    const res = computeOverview(products, rows, { now: NOW });
    expect(res.sparklines.tracked).toEqual([100, 100, 90, 90, 80, 80, 100, 70]);
    expect(res.sparklines.dropped).toEqual([0, 0, 1, 0, 1, 0, 0, 1]);
  });
});
