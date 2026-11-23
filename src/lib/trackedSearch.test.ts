import { describe, expect, it } from 'vitest';

import { rankSearchItems } from './searchMatch';
import { linkPathWords, toTrackedSearchItem, trackedSearchCandidate } from './trackedSearch';
import type { ProductView } from './types';

function makeProduct(overrides: Partial<ProductView> = {}): ProductView {
  return {
    id: 'p-1',
    name: 'Hot Wheels 5-Pack',
    categoryId: 'c-1',
    categoryName: 'Toys',
    targetPrice: 10,
    imageUrl: null,
    lowestPrice: 12,
    lowestRetailer: 'Kmart',
    links: [
      {
        id: 'l-1',
        retailer: 'Kmart',
        url: 'https://www.kmart.com.au/product/hw-5-pack',
        isActive: true,
        stockStatus: 'in_stock',
        latestPrice: 12,
        priceStale: false,
        latestAt: '2026-11-22T02:00:00Z',
        imageUrl: 'https://www.kmart.com.au/hw.jpg',
        imageCandidates: [],
        createdAt: '2026-11-01T00:00:00Z'
      },
      {
        id: 'l-2',
        retailer: 'Big W',
        url: 'https://www.bigw.com.au/product/hw-5-pack',
        isActive: true,
        stockStatus: 'in_stock',
        latestPrice: 9,
        priceStale: true,
        latestAt: '2026-11-05T02:00:00Z',
        imageUrl: null,
        imageCandidates: [],
        createdAt: '2026-11-01T00:00:00Z'
      }
    ],
    ...overrides
  };
}

describe('toTrackedSearchItem', () => {
  it('picks cheapest fresh price over a cheaper stale price and builds thumb via productThumb', () => {
    const item = toTrackedSearchItem(makeProduct());
    expect(item.price).toBe(12);
    expect(item.shop).toBe('Kmart');
    expect(item.stalePrice).toBeNull();
    expect(item.shops).toEqual(['Kmart', 'Big W']);
    expect(item.thumb?.proxied).toContain('/api/thumb?link=l-1');
    expect(item.urls).toHaveLength(2);
  });

  it('preserves stale price and lastSeenAt when no fresh price exists', () => {
    const item = toTrackedSearchItem(
      makeProduct({
        links: [
          {
            id: 'l-2',
            retailer: 'Big W',
            url: 'https://www.bigw.com.au/product/hw-5-pack',
            isActive: true,
            stockStatus: 'in_stock',
            latestPrice: 9,
            priceStale: true,
            latestAt: '2026-11-05T02:00:00Z',
            imageUrl: null,
            imageCandidates: [],
            createdAt: '2026-11-01T00:00:00Z'
          }
        ]
      })
    );
    expect(item.price).toBeNull();
    expect(item.stalePrice).toBe(9);
    expect(item.lastSeenAt).toBe('2026-11-05T02:00:00Z');
    expect(item.shop).toBe('Big W');
  });
});

describe('instant list search uses groups, shops and link words', () => {
  // Same shape as a real list: groups "Hotwheels" and "Matchbox" whose product
  // titles do not contain the brand.
  function item(id: string, name: string, group: string, shops: [string, string][]) {
    return toTrackedSearchItem(
      makeProduct({
        id,
        name,
        categoryName: group,
        imageUrl: null,
        links: shops.map(([retailer, url], index) => ({
          id: `${id}-l${index}`,
          retailer,
          url,
          isActive: true,
          stockStatus: 'in_stock' as const,
          latestPrice: 2 + index,
          priceStale: false,
          latestAt: '2026-11-19T02:00:00Z',
          imageUrl: null,
          imageCandidates: [],
          createdAt: '2026-11-01T00:00:00Z'
        }))
      })
    );
  }

  const items = [
    item('basic-car', 'Basic Car', 'Hotwheels', [
      ['Kmart', 'https://www.kmart.com.au/product/hot-wheels-basic-car-assorted-5621682/'],
      ['Rejectshop', 'https://www.rejectshop.com.au/p/hot-wheels-car-assorted']
    ]),
    item('super-rigs', 'Super rigs', 'Hotwheels', [
      ['Coles', 'https://www.coles.com.au/product/hot-wheels-super-rig-1-each-2229716'],
      ['Toymate', 'https://toymate.com.au/hotwheels-super-rigs/']
    ]),
    item('moving-parts', 'Moving Parts', 'Matchbox', [['Woolworths', 'https://www.woolworths.com.au/shop/productdetails/1']]),
    item('power-grab', 'Power Grab', 'Matchbox', [
      ['Woolworths', 'https://www.woolworths.com.au/shop/productdetails/432474/matchbox-heritage-car-toy-assorted'],
      ['Coles', 'https://www.coles.com.au/product/matchbox-vehicle-power-grab-1-each-3561300']
    ])
  ];

  const ids = (query: string) =>
    rankSearchItems(query, items, trackedSearchCandidate).map((hit) => hit.item.id).sort();

  it('matches the group name with and without the space', () => {
    expect(ids('hotwheels')).toEqual(['basic-car', 'super-rigs']);
    expect(ids('hot wheels')).toEqual(['basic-car', 'super-rigs']);
    expect(ids('Hot-Wheels')).toEqual(['basic-car', 'super-rigs']);
  });

  it('tolerates a typo in the group name', () => {
    expect(ids('matchbx')).toEqual(['moving-parts', 'power-grab']);
    expect(ids('matchbox')).toEqual(['moving-parts', 'power-grab']);
  });

  it('combines group and title words', () => {
    expect(ids('matchbox power')).toEqual(['power-grab']);
    expect(ids('hotwheels rigs')).toEqual(['super-rigs']);
  });

  it('matches shop names', () => {
    expect(ids('rejectshop')).toEqual(['basic-car']);
    expect(ids('toymate')).toEqual(['super-rigs']);
  });

  it('ranks a title match above a group-only match', () => {
    const ranked = rankSearchItems('basic car', items, trackedSearchCandidate);
    expect(ranked[0].item.id).toBe('basic-car');
  });

  it('takes product words from link paths and drops generic URL words', () => {
    expect(linkPathWords('https://www.bigw.com.au/product/matchbox-power-grab-assorted-/p/432474')).toBe(
      'matchbox power grab'
    );
    expect(linkPathWords('not a url')).toBe('');
  });

  it('does not match unrelated words', () => {
    expect(ids('lego')).toEqual([]);
  });
});
