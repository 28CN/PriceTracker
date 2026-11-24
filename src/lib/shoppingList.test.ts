import { describe, expect, it } from 'vitest';

import { isRecentlySold, lowestPriceRows, shopGroups, shopKeyFor, shopNameFor, SHOP_RECENT_DAYS } from './shoppingList';
import type { LinkView, ProductView } from './types';

const NOW = Date.parse('2026-11-24T00:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

function link(partial: Partial<LinkView> & { id: string; retailer: string; url: string }): LinkView {
  const latestAt = partial.latestAt ?? null;
  return {
    isActive: true,
    stockStatus: 'in_stock',
    latestPrice: null,
    priceStale: latestAt ? NOW - Date.parse(latestAt) > 7 * 24 * 60 * 60 * 1000 : false,
    imageUrl: null,
    imageCandidates: [],
    createdAt: null,
    ...partial,
    latestAt
  };
}

function product(id: string, name: string, links: LinkView[], targetPrice: number | null = null): ProductView {
  return {
    id,
    name,
    categoryId: null,
    categoryName: null,
    targetPrice,
    imageUrl: null,
    links,
    lowestPrice: null,
    lowestRetailer: null
  };
}

const coles = (id: string, price: number | null, at: string | null, extra: Partial<LinkView> = {}) =>
  link({ id, retailer: 'Coles', url: `https://www.coles.com.au/product/${id}`, latestPrice: price, latestAt: at, ...extra });
const woolies = (id: string, price: number | null, at: string | null, extra: Partial<LinkView> = {}) =>
  link({ id, retailer: 'Woolworths', url: `https://www.woolworths.com.au/shop/${id}`, latestPrice: price, latestAt: at, ...extra });

describe('isRecentlySold', () => {
  it('counts a price inside the window', () => {
    expect(isRecentlySold(coles('a', 5, daysAgo(SHOP_RECENT_DAYS - 1)), NOW)).toBe(true);
  });

  it('drops a price older than the window, even though the link is still saved', () => {
    expect(isRecentlySold(coles('a', 5, daysAgo(SHOP_RECENT_DAYS + 1)), NOW)).toBe(false);
  });

  it('drops sold-out, switched-off and never-priced links', () => {
    expect(isRecentlySold(coles('a', 5, daysAgo(1), { stockStatus: 'unavailable' }), NOW)).toBe(false);
    expect(isRecentlySold(coles('a', 5, daysAgo(1), { isActive: false }), NOW)).toBe(false);
    expect(isRecentlySold(coles('a', null, null), NOW)).toBe(false);
  });

  it('honours a shorter window', () => {
    expect(isRecentlySold(coles('a', 5, daysAgo(10)), NOW, 7)).toBe(false);
  });
});

describe('shopGroups', () => {
  const matchbox = product('mb', 'Matchbox car', [coles('mb-c', 3, daysAgo(40)), woolies('mb-w', 3.5, daysAgo(2))]);
  const milk = product('milk', 'Milk 2L', [coles('milk-c', 3.1, daysAgo(1)), woolies('milk-w', 3.1, daysAgo(3))], 3.2);
  const bread = product('bread', 'Bread', [coles('bread-c', 4, daysAgo(10)), woolies('bread-w', 4.5, daysAgo(1))]);

  const groups = shopGroups([matchbox, milk, bread], NOW);
  const byKey = Object.fromEntries(groups.map((group) => [group.key, group]));

  it('leaves out an item the shop stopped selling', () => {
    expect(byKey.coles.items.map((item) => item.product.id)).not.toContain('mb');
    expect(byKey.woolworths.items.map((item) => item.product.id)).toContain('mb');
  });

  it('marks ties as cheapest at both shops', () => {
    const colesMilk = byKey.coles.items.find((item) => item.product.id === 'milk')!;
    const wooliesMilk = byKey.woolworths.items.find((item) => item.product.id === 'milk')!;
    expect(colesMilk.cheapest).toBe(true);
    expect(wooliesMilk.cheapest).toBe(true);
    expect(colesMilk.belowGoal).toBe(true);
  });

  it('keeps an 8 to 14 day old price but marks it old and never cheapest', () => {
    const colesBread = byKey.coles.items.find((item) => item.product.id === 'bread')!;
    expect(colesBread.stale).toBe(true);
    expect(colesBread.cheapest).toBe(false);
    expect(byKey.woolworths.items.find((item) => item.product.id === 'bread')!.cheapest).toBe(true);
  });

  it('does not call a single-shop item cheapest', () => {
    const only = shopGroups([product('x', 'Solo', [coles('x-c', 2, daysAgo(1))])], NOW);
    expect(only[0].items[0].cheapest).toBe(false);
  });

  it('lists deals first and keeps shops with nothing current', () => {
    expect(byKey.coles.items[0].product.id).toBe('milk');
    const empty = shopGroups([matchbox], NOW).find((group) => group.key === 'coles');
    expect(empty?.items).toEqual([]);
  });

  it('uses the cheaper of two links at the same shop', () => {
    const twin = product('t', 'Twin', [coles('t1', 6, daysAgo(1)), coles('t2', 5, daysAgo(2))]);
    const [group] = shopGroups([twin], NOW);
    expect(group.items).toHaveLength(1);
    expect(group.items[0].price).toBe(5);
  });
});

describe('lowestPriceRows', () => {
  it('picks the lowest current price and lists every shop tied on it', () => {
    const milk = product('milk', 'Milk', [coles('c', 3.1, daysAgo(1)), woolies('w', 3.1, daysAgo(2))], 3);
    const [row] = lowestPriceRows([milk]);
    expect(row.price).toBe(3.1);
    expect(row.retailers.sort()).toEqual(['Coles', 'Woolworths']);
    expect(row.belowGoal).toBe(false);
  });

  it('prefers a current price over a cheaper old one', () => {
    const tea = product('tea', 'Tea', [coles('c', 2, daysAgo(20)), woolies('w', 4, daysAgo(1))]);
    const [row] = lowestPriceRows([tea]);
    expect(row.price).toBe(4);
    expect(row.stale).toBe(false);
  });

  it('shows an old price muted when that is all there is', () => {
    const jam = product('jam', 'Jam', [coles('c', 2, daysAgo(20))], 5);
    const [row] = lowestPriceRows([jam]);
    expect(row.stale).toBe(true);
    expect(row.lastSeenAt).toBe(daysAgo(20));
    expect(row.belowGoal).toBe(false);
  });

  it('sorts deals first, then by name', () => {
    const rows = lowestPriceRows([
      product('b', 'Banana', [coles('b', 9, daysAgo(1))], 10),
      product('a', 'Apple', [coles('a', 9, daysAgo(1))], 5),
      product('z', 'Zucchini', [], null)
    ]);
    expect(rows.map((row) => row.product.id)).toEqual(['b', 'a', 'z']);
    expect(lowestPriceRows(rows.map((row) => row.product), 'name').map((row) => row.product.id)).toEqual(['a', 'b', 'z']);
  });
});

describe('shopKeyFor', () => {
  it('groups by the shop website first', () => {
    expect(shopKeyFor({ retailer: 'coles supermarket', url: 'https://www.coles.com.au/x' })).toBe('coles');
    expect(shopKeyFor({ retailer: 'Corner Store', url: 'https://corner.example/x' })).toBe('cornerstore');
  });

  it('uses the proper shop name for a known website', () => {
    expect(shopNameFor({ retailer: 'Rejectshop', url: 'https://www.therejectshop.com.au/p/1' })).toBe('The Reject Shop');
    expect(shopNameFor({ retailer: 'Corner Store', url: 'https://corner.example/x' })).toBe('Corner Store');
  });
});
