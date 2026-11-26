import { describe, expect, it } from 'vitest';

import { brandKey, matchDeals, newSince, type BrandPref } from './dealMatch';
import type { ProductView } from './types';

const product = (id: string, name: string): ProductView => ({
  id,
  name,
  categoryId: null,
  categoryName: null,
  targetPrice: null,
  imageUrl: null,
  links: [],
  lowestPrice: null,
  lowestRetailer: null
});

const deals = [
  { node_id: 1, title: 'Hot Wheels 10 Pack Basic Cars $9 @ Target' },
  { node_id: 2, title: 'Hot Wheels Monster Trucks $15 @ Kmart' },
  { node_id: 3, title: 'LEGO City Tram $59 @ Big W' },
  { node_id: 4, title: 'Bluey Plush $10 @ Target' },
  { node_id: 5, title: '$10 off $50 @ Coles' }
];
const products = [product('a', 'Hot Wheels Basic Car'), product('b', 'LEGO Minifigures Series 29')];

describe('brandKey', () => {
  it('normalises labels for storage', () => {
    expect(brandKey("Arnott's")).toBe('arnott s');
    expect(brandKey('Pokémon')).toBe('pokemon');
    expect(brandKey('  ')).toBeNull();
  });
});

describe('matchDeals', () => {
  it('ranks exact items, then brands', () => {
    const matches = matchDeals(deals, products, []);
    expect(matches.get(1)).toMatchObject({ kind: 'item', id: 'a' });
    expect(matches.get(2)).toMatchObject({ kind: 'brand', label: 'Hot Wheels', followed: false });
    expect(matches.get(3)).toMatchObject({ kind: 'brand', label: 'LEGO' });
    expect(matches.has(4)).toBe(false);
    expect(matches.has(5)).toBe(false);
  });

  it('drops muted brands but keeps exact items', () => {
    const prefs: BrandPref[] = [{ key: 'hot wheels', label: 'Hot Wheels', state: 'mute' }];
    const matches = matchDeals(deals, products, prefs);
    expect(matches.get(1)?.kind).toBe('item');
    expect(matches.has(2)).toBe(false);
  });

  it('adds followed brands even with nothing on the list', () => {
    const prefs: BrandPref[] = [{ key: 'bluey', label: 'Bluey', state: 'follow' }];
    expect(matchDeals(deals, [], prefs).get(4)).toMatchObject({ kind: 'brand', label: 'Bluey', followed: true });
    expect(matchDeals(deals, products, prefs).get(4)).toMatchObject({ followed: true });
    expect(matchDeals(deals, [], []).size).toBe(0);
  });

  it('marks a followed brand that is also on the list', () => {
    const prefs: BrandPref[] = [{ key: 'lego', label: 'LEGO', state: 'follow' }];
    expect(matchDeals(deals, products, prefs).get(3)).toMatchObject({ followed: true });
  });
});

describe('newSince', () => {
  it('uses the last visit, or a day back', () => {
    const now = Date.parse('2026-11-26T04:00:00Z');
    expect(newSince('2026-11-26T01:00:00Z', now)).toBe(Date.parse('2026-11-26T01:00:00Z'));
    expect(newSince(null, now)).toBe(now - 86_400_000);
  });
});
