import { describe, expect, it } from 'vitest';

import type { PricePoint } from './priceInsight';
import { judgeItem, saleCycle, watchSections, weekMove, type WatchInput } from './watch';

const NOW = new Date('2026-11-26T04:00:00Z');
const day = (offset: number) => new Date(NOW.getTime() + offset * 86_400_000).toISOString();

/** Twice-weekly checks over `days`, usual $10, half price for a week every `every` days. */
function cycled(days: number, every: number, saleStart = 3): PricePoint[] {
  const points: PricePoint[] = [];
  for (let d = -days; d <= 0; d += 3.5) {
    const sinceStart = (((Math.round(d) + days - saleStart) % every) + every) % every;
    points.push({ at: day(Math.round(d)), price: sinceStart < 7 ? 5 : 10 });
  }
  return points;
}

describe('saleCycle', () => {
  it('finds a steady half-price rhythm and the next date', () => {
    const cycle = saleCycle(cycled(170, 28), NOW);
    expect(cycle).not.toBeNull();
    expect(cycle!.everyDays).toBeGreaterThanOrEqual(26);
    expect(cycle!.everyDays).toBeLessThanOrEqual(30);
    expect(cycle!.depth).toBeCloseTo(0.5, 1);
    expect(cycle!.next >= NOW.toISOString().slice(0, 10)).toBe(true);
  });

  it('does not guess from a flat price or a single sale', () => {
    const flat = Array.from({ length: 40 }, (_, i) => ({ at: day(-i * 3), price: 10 }));
    expect(saleCycle(flat, NOW)).toBeNull();
    const once = flat.map((p, i) => (i === 5 ? { ...p, price: 5 } : p));
    expect(saleCycle(once, NOW)).toBeNull();
  });
});

describe('weekMove', () => {
  const points = [
    { at: day(-20), price: 10 },
    { at: day(-8), price: 10 },
    { at: day(-1), price: 8 }
  ];
  it('compares with about a week ago', () => {
    expect(weekMove(points, 8, NOW)).toEqual({ from: 10, to: 8, change: -2, pct: -0.2 });
  });
  it('ignores tiny moves and missing history', () => {
    expect(weekMove(points, 10.02, NOW)).toBeNull();
    expect(weekMove([{ at: day(-2), price: 10 }], 8, NOW)).toBeNull();
    expect(weekMove([{ at: day(-40), price: 10 }], 8, NOW)).toBeNull();
    expect(weekMove(points, null, NOW)).toBeNull();
  });
});

describe('watchSections', () => {
  const base: WatchInput = {
    id: 'a',
    name: 'Tea',
    shop: 'Coles',
    url: null,
    price: 10,
    points: Array.from({ length: 30 }, (_, i) => ({ at: day(-60 + i * 2), price: 10 })),
    allTimeLow: { price: 8, at: day(-50) },
    backInStock: null
  };

  it('puts a real sale under Buy now and an upcoming sale under Wait', () => {
    const sale = judgeItem(
      { ...base, id: 'sale', price: 6, points: [...base.points, { at: day(0), price: 6 }] },
      NOW
    );
    const waiting = judgeItem({ ...base, id: 'wait', points: cycled(170, 28) }, NOW);
    const sections = watchSections([sale, { ...waiting, cycle: { everyDays: 28, next: day(5).slice(0, 10), depth: 0.5, sales: 6 } }], NOW);
    expect(sections.buyNow.map((item) => item.id)).toContain('sale');
    expect(sections.wait.map((item) => item.id)).toEqual(['wait']);
  });

  it('lists back in stock and weekly moves', () => {
    const back = judgeItem({ ...base, id: 'back', backInStock: { shop: 'Coles', at: day(-1) } }, NOW);
    const down = judgeItem(
      { ...base, id: 'down', price: 9, points: [...base.points, { at: day(0), price: 9 }] },
      NOW
    );
    const sections = watchSections([back, down], NOW);
    expect(sections.backInStock.map((item) => item.id)).toEqual(['back']);
    expect(sections.down.map((item) => item.id)).toEqual(['down']);
    expect(sections.up).toEqual([]);
  });
});
