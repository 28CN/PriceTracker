import { describe, expect, test } from 'vitest';

import { buildPromoPeriods, DEFAULT_PROMO, resolveCycle, type CycleRow } from './promoPeriods.ts';

const rows: CycleRow[] = [
  { retailer: 'Coles', anchor_weekday: 3, cycle_days: 7, timezone: 'Australia/Sydney' },
  { retailer: 'Chemist Warehouse', anchor_weekday: 3, cycle_days: 14, timezone: 'Australia/Sydney' }
];
const coles = resolveCycle('Coles', rows);

describe('resolveCycle', () => {
  test('case and whitespace variants match', () => {
    for (const n of ['coles', 'COLES', '  Coles ']) expect(resolveCycle(n, rows).isDefault).toBe(false);
    expect(resolveCycle('COLES', rows).retailer).toBe('COLES');
  });
  test('unknown retailer gets the default cycle', () => {
    const c = resolveCycle('Big W', rows);
    expect(c).toMatchObject({ ...DEFAULT_PROMO, isDefault: true, retailer: 'Big W' });
  });
});

describe('buildPromoPeriods', () => {
  test('Tue/Wed boundary in local time (not UTC day)', () => {
    // Tue 2026-10-27 23:30 AEDT = 12:30Z Tue; Wed 2026-10-28 00:30 AEDT = 13:30Z Tue (same UTC day!)
    const { periods } = buildPromoPeriods(
      [{ at: '2026-10-27T12:30:00Z', price: 5 }, { at: '2026-10-27T13:30:00Z', price: 3 }],
      coles, '2026-10-22T00:00:00Z', '2026-10-29T00:00:00Z'
    );
    expect(periods.map((p) => [p.start, p.minPrice])).toEqual([
      ['2026-10-21T00:00:00+11:00', 5],
      ['2026-10-28T00:00:00+11:00', 3]
    ]);
    expect(periods[0].end).toBe('2026-10-28T00:00:00+11:00');
  });
  test('period with no scrapes is null/unobserved; coverage counts it', () => {
    const { periods, coverage } = buildPromoPeriods(
      [{ at: '2026-09-02T01:00:00Z', price: 4 }, { at: '2026-09-17T01:00:00Z', price: 6 }],
      coles, '2026-09-02T01:00:00Z', '2026-09-17T01:00:00Z'
    );
    expect(periods.map((p) => p.observed)).toEqual([true, false, true]);
    expect(periods[1].minPrice).toBeNull();
    expect(coverage).toEqual({ observed: 2, total: 3, ratio: 0.667 });
  });
  test('several scrapes in one week give the minimum', () => {
    const { periods } = buildPromoPeriods(
      [9, 7, 8].map((price, k) => ({ at: `2026-09-0${3 + k}T02:00:00Z`, price })),
      coles, '2026-09-03T00:00:00Z', '2026-09-08T00:00:00Z'
    );
    expect(periods).toHaveLength(1);
    expect(periods[0].minPrice).toBe(7);
  });
  test('default cycle is Wednesday/7/Sydney', () => {
    const { periods } = buildPromoPeriods([], resolveCycle('Kmart', rows), '2026-07-01T00:00:00Z', '2026-07-10T00:00:00Z');
    expect(periods[0].start).toBe('2026-07-01T00:00:00+10:00');
    expect(periods[1].start).toBe('2026-07-08T00:00:00+10:00');
  });
  test('DST start week (Sydney, 2026-10-04) keeps local midnights', () => {
    const { periods } = buildPromoPeriods([], coles, '2026-09-30T00:00:00+10:00', '2026-10-08T00:00:00+11:00');
    expect(periods.map((p) => p.start)).toEqual(['2026-09-30T00:00:00+10:00', '2026-10-07T00:00:00+11:00']);
    expect(periods[0].end).toBe('2026-10-07T00:00:00+11:00');
  });
  test('DST end week (Sydney, 2026-04-05)', () => {
    const { periods } = buildPromoPeriods(
      [{ at: '2026-04-07T13:30:00Z', price: 2 }], // Tue 2026-04-07 23:30 AEST (+10), still the first period
      coles, '2026-04-01T00:00:00+11:00', '2026-04-08T12:00:00+10:00'
    );
    expect(periods.map((p) => p.start)).toEqual(['2026-04-01T00:00:00+11:00', '2026-04-08T00:00:00+10:00']);
    expect(periods[0].minPrice).toBe(2);
    expect(periods[1].observed).toBe(false);
  });
  test('14-day pharmacy cycle is fixed-aligned and contiguous', () => {
    const { periods } = buildPromoPeriods([], resolveCycle('chemist warehouse', rows), '2026-09-01T00:00:00Z', '2026-10-15T00:00:00Z');
    for (let k = 1; k < periods.length; k++) expect(periods[k].start).toBe(periods[k - 1].end);
    expect(new Set(periods.map((p) => new Date(p.start).getUTCDay()))).toEqual(new Set([2])); // local Wed 00:00 = Tue UTC
  });
});
