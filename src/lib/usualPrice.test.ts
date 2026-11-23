import { describe, expect, it } from 'vitest';

import { computeUsualPrice, type PriceObservation } from './usualPrice';

const DAY_MS = 86_400_000;

function iso(dateStr: string): string {
  return `${dateStr}T01:00:00.000Z`;
}

function weekly(startIso: string, prices: number[]): PriceObservation[] {
  const startMs = Date.parse(startIso);
  return prices.map((price, index) => ({
    at: new Date(startMs + index * 7 * DAY_MS).toISOString(),
    price
  }));
}

describe('computeUsualPrice', () => {
  it('keeps a steady price with no shifts', () => {
    const obs = weekly('2026-09-22T01:00:00.000Z', [3.5, 3.5, 3.5, 3.5, 3.5, 3.5]);
    const res = computeUsualPrice(obs, { now: new Date('2026-11-10T01:00:00.000Z') });

    expect(res).toEqual({
      series: [{ from: '2026-09-22T01:00:00.000Z', price: 3.5 }],
      currentUsual: 3.5,
      shifts: [],
      lowConfidence: false
    });
  });

  it('ignores a single one-week dip so it stays a deal and usual is unchanged', () => {
    const obs = weekly('2026-09-22T01:00:00.000Z', [3.5, 3.5, 3.5, 2.5, 3.5, 3.5]);
    const res = computeUsualPrice(obs, { now: new Date('2026-11-05T01:00:00.000Z') });

    expect(res.currentUsual).toBe(3.5);
    expect(res.shifts).toEqual([]);
    expect(res.series).toEqual([{ from: '2026-09-22T01:00:00.000Z', price: 3.5 }]);
    expect(res.lowConfidence).toBe(false);
  });

  it('ignores a one-week dip crawled twice in the same promo week (5 days apart)', () => {
    const obs: PriceObservation[] = [
      { at: iso('2026-10-05'), price: 3.5 },
      { at: iso('2026-10-12'), price: 3.5 },
      { at: iso('2026-10-19'), price: 3.5 },
      { at: iso('2026-10-21'), price: 2.5 }, // Wed promo start
      { at: iso('2026-10-26'), price: 2.5 }, // Mon same promo week (5d span)
      { at: iso('2026-10-28'), price: 3.5 } // Wed promo ends
    ];
    const res = computeUsualPrice(obs, { now: new Date('2026-11-01T01:00:00.000Z') });

    expect(res.currentUsual).toBe(3.5);
    expect(res.shifts).toEqual([]);
  });

  it('detects a rise that holds (3.50 -> 4.00) and dates the shift to first appearance', () => {
    // 6 weeks at $3.50 (22 Sep .. 27 Oct), then $4.00 on 3 Nov and 10 Nov.
    const obs = weekly('2026-09-22T01:00:00.000Z', [3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 4.0, 4.0]);
    const res = computeUsualPrice(obs, { now: new Date('2026-11-12T01:00:00.000Z') });

    expect(res.currentUsual).toBe(4.0);
    expect(res.lowConfidence).toBe(false);
    expect(res.shifts).toEqual([
      {
        at: '2026-11-03T01:00:00.000Z',
        from: 3.5,
        to: 4.0,
        direction: 'up'
      }
    ]);
    expect(res.series).toEqual([
      { from: '2026-09-22T01:00:00.000Z', price: 3.5 },
      { from: '2026-11-03T01:00:00.000Z', price: 4.0 }
    ]);
  });

  it('judges a dip after a rise against the NEW usual price', () => {
    // 6 weeks at $3.50, then $4.00 on 3 Nov & 10 Nov, then $3.00 special on 17 Nov.
    const obs = weekly('2026-09-22T01:00:00.000Z', [3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 4.0, 4.0, 3.0]);
    const res = computeUsualPrice(obs, { now: new Date('2026-11-18T01:00:00.000Z') });

    expect(res.currentUsual).toBe(4.0);
    expect(res.shifts).toHaveLength(1);
    expect(res.shifts[0]).toMatchObject({ at: '2026-11-03T01:00:00.000Z', from: 3.5, to: 4.0, direction: 'up' });
    const latest = obs[obs.length - 1].price;
    expect((res.currentUsual! - latest) / res.currentUsual!).toBeCloseTo(0.25, 4);
  });

  it('does NOT move the usual price on a 2-week half-price special (two weekly checks, then back)', () => {
    const obs = weekly('2026-09-22T01:00:00.000Z', [4.0, 4.0, 4.0, 2.0, 2.0, 4.0, 4.0]);
    const res = computeUsualPrice(obs, { now: new Date('2026-11-12T01:00:00.000Z') });

    expect(res.currentUsual).toBe(4.0);
    expect(res.shifts).toEqual([]);
    expect(res.series).toEqual([{ from: '2026-09-22T01:00:00.000Z', price: 4.0 }]);
  });

  it('moves the usual price down on a permanent price cut held 5 weeks (dated to its first day)', () => {
    // 4 weeks at $4.00 (22 Sep .. 13 Oct), then $3.00 held for 5 weekly checks (20 Oct .. 17 Nov, 28-day span).
    const obs = weekly('2026-09-22T01:00:00.000Z', [4.0, 4.0, 4.0, 4.0, 3.0, 3.0, 3.0, 3.0, 3.0]);
    const res = computeUsualPrice(obs, { now: new Date('2026-11-18T01:00:00.000Z') });

    expect(res.currentUsual).toBe(3.0);
    expect(res.shifts).toEqual([
      {
        at: '2026-10-20T01:00:00.000Z',
        from: 4.0,
        to: 3.0,
        direction: 'down'
      }
    ]);
    expect(res.series).toEqual([
      { from: '2026-09-22T01:00:00.000Z', price: 4.0 },
      { from: '2026-10-20T01:00:00.000Z', price: 3.0 }
    ]);
  });

  it('handles a rise then revert back to the old price (brief rise = no shift; 2w revert stays deal; 4+w revert shifts back down)', () => {
    // Brief 1-week rise -> no shift at all.
    const briefRise = weekly('2026-09-22T01:00:00.000Z', [3.5, 3.5, 3.5, 4.0, 3.5, 3.5]);
    const briefRes = computeUsualPrice(briefRise, { now: new Date('2026-11-05T01:00:00.000Z') });
    expect(briefRes.currentUsual).toBe(3.5);
    expect(briefRes.shifts).toEqual([]);

    // Held rise (3 Nov & 10 Nov) then only 2 weeks at $3.50 (17 Nov & 24 Nov) -> does NOT shift back down yet.
    const shortRevert = weekly('2026-09-22T01:00:00.000Z', [3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 4.0, 4.0, 3.5, 3.5]);
    const shortRevertRes = computeUsualPrice(shortRevert, { now: new Date('2026-11-25T01:00:00.000Z') });
    expect(shortRevertRes.currentUsual).toBe(4.0);
    expect(shortRevertRes.shifts).toEqual([
      { at: '2026-11-03T01:00:00.000Z', from: 3.5, to: 4.0, direction: 'up' }
    ]);

    // Held rise (3 Nov & 10 Nov) then revert held 4+ weeks (5 weekly checks 17 Nov .. 15 Dec, 28d span) -> shifts back down.
    const heldRevert = weekly(
      '2026-09-22T01:00:00.000Z',
      [3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 4.0, 4.0, 3.5, 3.5, 3.5, 3.5, 3.5]
    );
    const revertRes = computeUsualPrice(heldRevert, { now: new Date('2026-12-16T01:00:00.000Z') });
    expect(revertRes.currentUsual).toBe(3.5);
    expect(revertRes.shifts).toEqual([
      { at: '2026-11-03T01:00:00.000Z', from: 3.5, to: 4.0, direction: 'up' },
      { at: '2026-11-17T01:00:00.000Z', from: 4.0, to: 3.5, direction: 'down' }
    ]);
    expect(revertRes.series).toEqual([
      { from: '2026-09-22T01:00:00.000Z', price: 3.5 },
      { from: '2026-11-03T01:00:00.000Z', price: 4.0 },
      { from: '2026-11-17T01:00:00.000Z', price: 3.5 }
    ]);
  });

  it('flags sparse data (< 3 daily observations) as low confidence with latest price and no shifts', () => {
    const empty = computeUsualPrice([], { now: new Date('2026-11-23T00:00:00.000Z') });
    expect(empty).toEqual({ series: [], currentUsual: null, shifts: [], lowConfidence: true });

    const two = computeUsualPrice(
      [
        { at: iso('2026-11-03'), price: 3.5 },
        { at: iso('2026-11-10'), price: 4.0 }
      ],
      { now: new Date('2026-11-12T00:00:00.000Z') }
    );
    expect(two).toEqual({
      series: [{ from: iso('2026-11-03'), price: 4.0 }],
      currentUsual: 4.0,
      shifts: [],
      lowConfidence: true
    });
  });

  it('breaks mode ties toward the higher price and falls back to median when no price repeats', () => {
    // Alternating $2 / $4 with no consecutive hold -> mode tie breaks to higher ($4).
    const alternating = weekly('2026-10-06T01:00:00.000Z', [2.0, 4.0, 2.0, 4.0]);
    const altRes = computeUsualPrice(alternating, { now: new Date('2026-11-01T00:00:00.000Z') });
    expect(altRes.currentUsual).toBe(4.0);
    expect(altRes.shifts).toEqual([]);

    // No price repeats -> median of [10, 11, 12, 14] = 11.5.
    const unique = weekly('2026-10-06T01:00:00.000Z', [10, 14, 11, 12]);
    const uniqRes = computeUsualPrice(unique, { now: new Date('2026-11-01T00:00:00.000Z') });
    expect(uniqRes.currentUsual).toBe(11.5);
    expect(uniqRes.shifts).toEqual([]);
  });

  it('computes usual price independently per shop', () => {
    const now = new Date('2026-11-12T01:00:00.000Z');
    const woolworths = computeUsualPrice(
      weekly('2026-09-22T01:00:00.000Z', [3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 4.0, 4.0]),
      { now }
    );
    const coles = computeUsualPrice(
      weekly('2026-09-22T01:00:00.000Z', [3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5]),
      { now }
    );

    expect(woolworths.currentUsual).toBe(4.0);
    expect(woolworths.shifts).toHaveLength(1);
    expect(coles.currentUsual).toBe(3.5);
    expect(coles.shifts).toEqual([]);
  });

  it('collapses multiple scrapes on the same Sydney calendar day across UTC midnight', () => {
    // 2026-11-03T23:00Z (10:00 AEDT on 4 Nov) and 2026-11-04T01:00Z (12:00 AEDT on 4 Nov)
    // are different UTC days but the SAME Sydney calendar day (4 Nov), so only 2 Sydney days total -> sparse.
    const sameSydneyDay: PriceObservation[] = [
      { at: '2026-10-28T01:00:00.000Z', price: 3.5 },
      { at: '2026-11-03T23:00:00.000Z', price: 3.5 },
      { at: '2026-11-04T01:00:00.000Z', price: 4.0 }
    ];
    const sparseRes = computeUsualPrice(sameSydneyDay, { now: new Date('2026-11-05T00:00:00.000Z') });
    expect(sparseRes.lowConfidence).toBe(true);
    expect(sparseRes.currentUsual).toBe(4.0);

    // Same-day bursts never trigger a shift.
    const burst: PriceObservation[] = [
      { at: '2026-10-01T01:00:00.000Z', price: 3.5 },
      { at: '2026-10-08T01:00:00.000Z', price: 3.5 },
      { at: '2026-10-15T01:00:00.000Z', price: 3.5 },
      { at: '2026-10-22T01:00:00.000Z', price: 4.0 },
      { at: '2026-10-22T05:00:00.000Z', price: 4.0 },
      { at: '2026-10-22T09:00:00.000Z', price: 4.0 }
    ];
    const res = computeUsualPrice(burst, { now: new Date('2026-10-23T00:00:00.000Z') });
    expect(res.currentUsual).toBe(3.5);
    expect(res.shifts).toEqual([]);
  });
});
