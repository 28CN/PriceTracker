import { describe, expect, it } from 'vitest';

import {
  clamp01,
  easeOutCubic,
  goalCelebrationKey,
  interpolateCount,
  minChForCount,
  recordBurstClick
} from './motion';

describe('clamp01', () => {
  it('clamps out-of-range and non-finite inputs', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.42)).toBe(0.42);
    expect(clamp01(1)).toBe(1);
    expect(clamp01(2.5)).toBe(1);
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('easeOutCubic', () => {
  it('starts at 0, ends at 1, and decelerates monotonically', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);

    const quarter = easeOutCubic(0.25);
    const half = easeOutCubic(0.5);
    const threeQuarters = easeOutCubic(0.75);

    expect(quarter).toBeGreaterThan(0.25);
    expect(half).toBeCloseTo(0.875, 6);
    expect(threeQuarters).toBeGreaterThan(half);
    expect(threeQuarters).toBeLessThan(1);
  });
});

describe('interpolateCount', () => {
  it('counts up from 0 with ease-out rounding', () => {
    expect(interpolateCount(0, 20, 0)).toBe(0);
    expect(interpolateCount(0, 20, 0.5)).toBe(18);
    expect(interpolateCount(0, 20, 1)).toBe(20);
  });

  it('supports counting down and between arbitrary values', () => {
    expect(interpolateCount(10, 4, 0)).toBe(10);
    expect(interpolateCount(10, 4, 0.5)).toBe(5);
    expect(interpolateCount(10, 4, 1)).toBe(4);
  });

  it('clamps progress outside 0..1 and avoids -0', () => {
    expect(interpolateCount(0, 10, -0.2)).toBe(0);
    expect(interpolateCount(0, 10, 1.5)).toBe(10);
    expect(Object.is(interpolateCount(-0, 0, 0.5), -0)).toBe(false);
    expect(interpolateCount(Number.NaN, 5, 1)).toBe(5);
  });

  it('accepts a custom easing function', () => {
    const linear = (t: number) => t;
    expect(interpolateCount(0, 100, 0.25, linear)).toBe(25);
    expect(interpolateCount(0, 100, 0.5, linear)).toBe(50);
  });
});

describe('minChForCount', () => {
  it('returns digit width of the rounded target value', () => {
    expect(minChForCount(0)).toBe(1);
    expect(minChForCount(9)).toBe(1);
    expect(minChForCount(10)).toBe(2);
    expect(minChForCount(125)).toBe(3);
    expect(minChForCount(-5)).toBe(2);
    expect(minChForCount(Number.NaN)).toBe(1);
  });
});

describe('recordBurstClick', () => {
  it('triggers on the 3rd click within the time window and resets', () => {
    const first = recordBurstClick([], 1000, 1500, 3);
    expect(first).toEqual({ next: [1000], triggered: false });

    const second = recordBurstClick(first.next, 1400, 1500, 3);
    expect(second).toEqual({ next: [1000, 1400], triggered: false });

    const third = recordBurstClick(second.next, 2200, 1500, 3);
    expect(third).toEqual({ next: [], triggered: true });
  });

  it('drops clicks older than the window', () => {
    const first = recordBurstClick([], 1000, 1500, 3);
    const second = recordBurstClick(first.next, 1500, 1500, 3);
    const third = recordBurstClick(second.next, 2800, 1500, 3);
    expect(third).toEqual({ next: [1500, 2800], triggered: false });

    const fourth = recordBurstClick(third.next, 2900, 1500, 3);
    expect(fourth).toEqual({ next: [], triggered: true });
  });
});

describe('goalCelebrationKey', () => {
  it('produces distinct keys per product id and formatted price', () => {
    expect(goalCelebrationKey('prod-1', 12.5)).toBe('pt:goal-burst:prod-1:12.50');
    expect(goalCelebrationKey('prod-1', 12)).toBe('pt:goal-burst:prod-1:12.00');
    expect(goalCelebrationKey('prod-2', 12.5)).toBe('pt:goal-burst:prod-2:12.50');
  });
});
