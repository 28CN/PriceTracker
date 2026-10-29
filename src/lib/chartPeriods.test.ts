import { describe, expect, it } from 'vitest';

import { coverageText, mergePeriods, sydneyDate } from './chartPeriods';

const wk = (start: string, end: string, minPrice: number | null) => ({ start, end, minPrice, observed: minPrice !== null });
const A = '2026-10-14T00:00:00+11:00';
const B = '2026-10-21T00:00:00+11:00';
const C = '2026-10-28T00:00:00+11:00';
const D = '2026-11-04T00:00:00+11:00';

describe('mergePeriods', () => {
  it('takes the lowest price across links per period', () => {
    const m = mergePeriods([
      { promo: { cycleDays: 7 }, periods: [wk(A, B, 5), wk(B, C, null), wk(C, D, 4)] },
      { promo: { cycleDays: 7 }, periods: [wk(A, B, 3), wk(B, C, null), wk(C, D, 6)] }
    ]);
    expect(m?.periods.map((p) => p.minPrice)).toEqual([3, null, 4]);
    expect(m?.coverage).toEqual({ observed: 2, total: 3, ratio: 2 / 3 });
  });
  it('returns null without periods', () => {
    expect(mergePeriods([])).toBeNull();
    expect(mergePeriods([{ promo: { cycleDays: 7 }, periods: [] }])).toBeNull();
  });
});

describe('copy', () => {
  it('describes coverage in plain words', () => {
    expect(coverageText({ observed: 6, total: 8, ratio: 0.75 }, 7)).toBe('Checked 6 of 8 sale weeks');
    expect(coverageText({ observed: 1, total: 1, ratio: 1 }, 14)).toBe('Checked 1 of 1 sale fortnight');
  });
  it('formats dates on the Sydney calendar', () => {
    // 13:30 UTC on 27 Oct is already 28 Oct in Sydney.
    expect(sydneyDate('2026-10-27T13:30:00Z')).toBe('28 Oct');
  });
});
