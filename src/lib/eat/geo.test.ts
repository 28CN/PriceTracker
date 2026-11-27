import { describe, expect, it } from 'vitest';

import { PERTH_CBD, distanceKm, formatKm, nearestByChain, type EatStore } from './geo';

describe('geo', () => {
  it('measures straight-line distance', () => {
    // Perth CBD to Fremantle is about 15 km.
    expect(distanceKm(PERTH_CBD, { lat: -32.0569, lon: 115.7439 })).toBeGreaterThan(14);
    expect(distanceKm(PERTH_CBD, { lat: -32.0569, lon: 115.7439 })).toBeLessThan(17);
  });

  it('finds the nearest store per chain', () => {
    const stores: EatStore[] = [
      ['kfc', 'Far', 'x', 'Joondalup', -31.745, 115.766],
      ['kfc', 'Near', 'y', 'Perth', -31.951, 115.86],
      ['subway', 'Only', 'z', 'Subiaco', -31.948, 115.825]
    ];
    const near = nearestByChain(stores, PERTH_CBD);
    expect(near.get('kfc')?.name).toBe('Near');
    expect(near.get('subway')?.km).toBeGreaterThan(3);
  });

  it('formats distances', () => {
    expect(formatKm(0.04)).toBe('100 m');
    expect(formatKm(0.46)).toBe('500 m');
    expect(formatKm(3.24)).toBe('3.2 km');
    expect(formatKm(14.6)).toBe('15 km');
  });
});
