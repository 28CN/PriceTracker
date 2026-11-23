import { describe, expect, it } from 'vitest';

import { toTrackedSearchItem } from './trackedSearch';
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
