import { describe, expect, it } from 'vitest';

import { sparkFor, sparkPoints } from './sparkline';

const rows = [
  { link_id: 'coles', product_id: 'p', day: '2026-11-02', min_price: '4.00' },
  { link_id: 'woolies', product_id: 'p', day: '2026-11-01', min_price: 3.5 },
  { link_id: 'coles', product_id: 'p', day: '2026-11-01', min_price: 4.2 },
  { link_id: 'woolies', product_id: 'p', day: '2026-11-02', min_price: 3.9 },
  { link_id: 'x', product_id: 'other', day: '2026-11-01', min_price: 1 }
];

describe('sparkFor', () => {
  it("uses the deal shop's links when it has enough days", () => {
    expect(sparkFor(rows, 'p', ['coles'])).toEqual({ points: [4.2, 4], low: 4, high: 4.2 });
  });

  it('falls back to the lowest across links, by day', () => {
    expect(sparkFor(rows, 'p', [])?.points).toEqual([3.5, 3.9]);
  });

  it('needs two days', () => {
    expect(sparkFor(rows, 'other', [])).toBeNull();
  });
});

describe('sparkPoints', () => {
  it('maps the high to the top and the low to the bottom', () => {
    expect(sparkPoints([2, 1], 10, 10)).toBe('2.0,2.0 8.0,8.0');
  });

  it('draws a flat line in the middle', () => {
    expect(sparkPoints([3, 3, 3], 10, 10)).toBe('2.0,5.0 5.0,5.0 8.0,5.0');
  });
});
