import { describe, expect, it } from 'vitest';

import {
  allTimeLow,
  buildSeries,
  dailyCloses,
  findRaiseBeforeDrop,
  judgeDiscount,
  lastDrop,
  lowestPriceSeries,
  median,
  type PricePoint
} from './priceInsight';

const NOW = new Date('2026-10-29T12:00:00Z');
const day = (n: number, hour = 6) =>
  new Date(NOW.getTime() - n * 86_400_000 + (hour - 12) * 3_600_000).toISOString();
/** One point per day: prices[0] is the oldest, the last entry is today. */
const daily = (prices: number[]): PricePoint[] =>
  prices.map((price, i) => ({ at: day(prices.length - 1 - i), price }));

describe('buildSeries', () => {
  it('groups by link, sorts ascending, coerces numeric strings and drops junk', () => {
    const s = buildSeries([
      { linkId: 'a', price: '12.50', createdAt: day(1) },
      { linkId: 'a', price: 10, createdAt: day(3) },
      { linkId: 'b', price: 9, createdAt: day(2) },
      { linkId: 'a', price: 'abc', createdAt: day(2) },
      { linkId: 'a', price: 0, createdAt: day(2) },
      { linkId: 'b', price: 5, createdAt: 'not a date' }
    ]);
    expect(s).toEqual([
      { linkId: 'a', points: [{ at: day(3), price: 10 }, { at: day(1), price: 12.5 }] },
      { linkId: 'b', points: [{ at: day(2), price: 9 }] }
    ]);
  });
  it('returns [] for no rows', () => expect(buildSeries([])).toEqual([]));
});

describe('lowestPriceSeries', () => {
  it('tracks the lowest latest-known price across links and collapses repeats', () => {
    const out = lowestPriceSeries([
      { linkId: 'a', points: [{ at: day(5), price: 100 }, { at: day(2), price: 120 }] },
      { linkId: 'b', points: [{ at: day(4), price: 110 }, { at: day(3), price: 110 }, { at: day(1), price: 90 }] }
    ]);
    expect(out).toEqual([
      { at: day(5), price: 100 },
      { at: day(2), price: 110 }, // a went up to 120, so b's 110 is now lowest
      { at: day(1), price: 90 }
    ]);
  });
  it('keeps repeated prices when collapse is false', () => {
    const out = lowestPriceSeries([{ linkId: 'a', points: daily([5, 5, 5]) }], { collapse: false });
    expect(out.map((p) => p.price)).toEqual([5, 5, 5]);
  });
  it('merges simultaneous observations into one point', () => {
    const out = lowestPriceSeries([
      { linkId: 'a', points: [{ at: day(1), price: 50 }] },
      { linkId: 'b', points: [{ at: day(1), price: 40 }] }
    ]);
    expect(out).toEqual([{ at: day(1), price: 40 }]);
  });
});

describe('allTimeLow / median / dailyCloses / lastDrop', () => {
  it('allTimeLow picks the earliest of equal lows', () => {
    expect(allTimeLow(daily([50, 40, 60, 40]))).toEqual({ at: day(2), price: 40 });
    expect(allTimeLow([])).toBeNull();
  });
  it('median handles odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it('dailyCloses keeps the last price of each UTC day', () => {
    const pts = [
      { at: day(1, 1), price: 10 },
      { at: day(1, 9), price: 12 },
      { at: day(0, 2), price: 11 }
    ];
    expect(dailyCloses(pts).map((p) => p.price)).toEqual([12, 11]);
  });
  it('lastDrop finds the latest decrease', () => {
    expect(lastDrop(daily([10, 8, 9, 7, 7]))).toMatchObject({ from: 9, to: 7 });
    expect(lastDrop(daily([5, 6, 7]))).toBeNull();
  });
});

describe('findRaiseBeforeDrop', () => {
  it('flags a raise followed by a "sale" back to the old price', () => {
    expect(findRaiseBeforeDrop(daily([100, 100, 130, 130, 100]))).toEqual({ at: day(2), from: 100, to: 130 });
  });
  it('ignores a raise when the drop goes clearly below the pre-raise price', () => {
    expect(findRaiseBeforeDrop(daily([100, 100, 130, 130, 80]))).toBeNull();
  });
  it('ignores a raise older than the lookback window', () => {
    const pts = daily([100, 130, ...Array(20).fill(130), 100]);
    expect(findRaiseBeforeDrop(pts)).toBeNull();
  });
  it('ignores small (<5%) bumps', () => {
    expect(findRaiseBeforeDrop(daily([100, 100, 103, 103, 100]))).toBeNull();
  });
});

describe('judgeDiscount', () => {
  const opts = { now: NOW };

  it('insufficient_data with no points', () => {
    const r = judgeDiscount([], opts);
    expect(r.verdict).toBe('insufficient_data');
    expect(r.currentPrice).toBeNull();
  });

  it('insufficient_data with too few daily samples', () => {
    const r = judgeDiscount([{ at: day(30), price: 100 }, { at: day(0), price: 70 }], opts);
    expect(r.verdict).toBe('insufficient_data');
    expect(r.reasons).toContain('too_few_samples');
  });

  it('insufficient_data when history is shorter than a week, even with many samples', () => {
    const pts = Array.from({ length: 20 }, (_, i) => ({ at: day(i / 4, 12), price: 100 - i }));
    const r = judgeDiscount(pts, opts);
    expect(r.verdict).toBe('insufficient_data');
    expect(r.reasons).toEqual(['history_too_short']);
  });

  it('many crawls on one day count as one sample', () => {
    const pts = [
      ...Array.from({ length: 30 }, (_, i) => ({ at: new Date(Date.parse(day(10)) + i * 60_000).toISOString(), price: 100 })),
      { at: day(0), price: 80 }
    ];
    expect(judgeDiscount(pts, opts).sampleCount).toBe(2);
    expect(judgeDiscount(pts, opts).verdict).toBe('insufficient_data');
  });

  it('real_discount when well below both 30d and 90d medians', () => {
    const r = judgeDiscount(daily([...Array(40).fill(100), 85]), opts);
    expect(r.verdict).toBe('real_discount');
    expect(r.median90d).toBe(100);
    expect(r.median30d).toBe(100);
    expect(r.discountVsMedian90d).toBe(0.15);
    expect(r.reasons).toEqual(expect.arrayContaining(['all_time_low', 'below_median_90d', 'below_median_30d']));
    expect(r.isAllTimeLow).toBe(true);
  });

  it('no_discount when the price is at the usual level', () => {
    const r = judgeDiscount(daily([...Array(20).fill(100), 98]), opts);
    expect(r.verdict).toBe('no_discount');
    expect(r.reasons).toContain('not_below_median');
  });

  it('no_discount when below the 90d median but not the recent 30d median', () => {
    // Expensive two months ago, cheaper for the last month; "today" equals the recent norm.
    const r = judgeDiscount(daily([...Array(60).fill(150), ...Array(30).fill(100), 99]), opts);
    expect(r.median90d).toBe(150);
    expect(r.median30d).toBe(100);
    expect(r.verdict).toBe('no_discount');
    expect(r.reasons).toContain('below_median_90d');
    expect(r.reasons).not.toContain('below_median_30d');
  });

  it('fake_discount when the price was raised shortly before the drop', () => {
    const r = judgeDiscount(daily([...Array(30).fill(100), 140, 140, 140, 100]), opts);
    expect(r.verdict).toBe('fake_discount');
    expect(r.reasons[0]).toBe('raised_before_drop');
    expect(r.raise).toMatchObject({ from: 100, to: 140 });
    expect(r.lastDrop).toMatchObject({ from: 140, to: 100 });
  });

  it('still fake while the "sale" price holds for a few days', () => {
    const r = judgeDiscount(daily([...Array(30).fill(100), 140, 140, 99, 99, 99]), opts);
    expect(r.verdict).toBe('fake_discount');
  });

  it('a raise then a genuinely deeper cut is a real discount', () => {
    const r = judgeDiscount(daily([...Array(30).fill(100), 140, 140, 80]), opts);
    expect(r.verdict).toBe('real_discount');
    expect(r.raise).toBeNull();
  });

  it('ignores data older than 90 days for medians but keeps all-time low', () => {
    const old = { at: day(200), price: 50 };
    const r = judgeDiscount([old, ...daily([...Array(20).fill(100), 90])], opts);
    expect(r.allTimeLow).toEqual(old);
    expect(r.isAllTimeLow).toBe(false);
    expect(r.median90d).toBe(100);
    expect(r.verdict).toBe('real_discount');
  });

  it('is unaffected by input order and invalid points', () => {
    const pts = daily([...Array(40).fill(100), 85]);
    const shuffled = [...pts].reverse().concat({ at: day(3), price: Number.NaN });
    expect(judgeDiscount(shuffled, opts)).toEqual(judgeDiscount(pts, opts));
  });
});
