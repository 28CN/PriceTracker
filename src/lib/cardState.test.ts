import { describe, expect, it } from 'vitest';

import {
  headlineFor,
  headlineText,
  resolveCardPrice,
  shopGapDetail,
  shopGapLabel,
  type CardOffer
} from './cardState';
import { formatLastSeen } from './format';

const money = (value: number) => `$${value.toFixed(2)}`;

function offer(partial: Partial<CardOffer> & { id: string; retailer: string }): CardOffer {
  return {
    id: partial.id,
    retailer: partial.retailer,
    isActive: partial.isActive ?? true,
    stockStatus: partial.stockStatus ?? 'in_stock',
    latestPrice: partial.latestPrice ?? null,
    priceStale: partial.priceStale ?? false,
    latestAt: partial.latestAt ?? null
  };
}

describe('headlineFor', () => {
  it('shows a fresh price and ignores a queued recheck', () => {
    expect(headlineFor({ allUnavailable: false, price: 22.99, stalePrice: null, checkState: 'queued' }).kind).toBe(
      'price'
    );
  });

  it('shows the last price directly when the check is old', () => {
    const headline = headlineFor({
      allUnavailable: false,
      price: null,
      stalePrice: 41.99,
      staleAt: '2026-11-04T01:00:00.000Z',
      checkState: null
    });
    expect(headline).toEqual({ kind: 'stale', price: 41.99, lastSeenAt: '2026-11-04T01:00:00.000Z' });
    expect(headlineText(headline, money)).toBe('$41.99');
  });

  it('says checking soon only when a check is queued and there is no price', () => {
    expect(headlineText(headlineFor({ allUnavailable: false, price: null, stalePrice: null, checkState: 'queued' }), money)).toBe(
      'Checking soon'
    );
  });

  it('says checking only while a check is running', () => {
    expect(headlineText(headlineFor({ allUnavailable: false, price: null, stalePrice: null, checkState: 'checking' }), money)).toBe(
      'Checking…'
    );
  });

  it('does not call a missing price a queued check', () => {
    expect(headlineText(headlineFor({ allUnavailable: false, price: null, stalePrice: null, checkState: null }), money)).toBe(
      'No price yet'
    );
  });

  it('prefers a running check over a queued one', () => {
    expect(headlineFor({ allUnavailable: false, price: null, stalePrice: null, checkState: 'checking' }).kind).toBe(
      'checking'
    );
  });

  it('shows unavailable without inventing a price', () => {
    expect(headlineText(headlineFor({ allUnavailable: true, price: 10, stalePrice: null }), money)).toBe('Unavailable');
  });
});

describe('resolveCardPrice', () => {
  it('picks the cheapest shop when all prices are fresh', () => {
    const result = resolveCardPrice({
      links: [
        offer({ id: 'a', retailer: 'Coles', latestPrice: 25, latestAt: '2026-11-20T01:00:00.000Z' }),
        offer({ id: 'b', retailer: 'Woolworths', latestPrice: 20, latestAt: '2026-11-19T01:00:00.000Z' }),
        offer({ id: 'c', retailer: 'Kmart', latestPrice: 22, latestAt: '2026-11-21T01:00:00.000Z' })
      ]
    });

    expect(result.headline).toEqual({ kind: 'price', price: 20 });
    expect(result.headlineLink?.id).toBe('b');
    expect(result.cheapestFreshLink?.id).toBe('b');
    expect(result.isStale).toBe(false);
    expect(result.freshOffers).toHaveLength(3);
  });

  it('lets a fresh price beat a cheaper stale price for headline and Cheapest', () => {
    const result = resolveCardPrice({
      links: [
        offer({
          id: 'stale-low',
          retailer: 'Kmart',
          latestPrice: 12,
          priceStale: true,
          latestAt: '2026-11-01T01:00:00.000Z'
        }),
        offer({
          id: 'fresh-high',
          retailer: 'Coles',
          latestPrice: 25,
          priceStale: false,
          latestAt: '2026-11-20T01:00:00.000Z'
        }),
        offer({
          id: 'fresh-mid',
          retailer: 'Woolworths',
          latestPrice: 22,
          priceStale: false,
          latestAt: '2026-11-19T01:00:00.000Z'
        })
      ]
    });

    expect(result.headline).toEqual({ kind: 'price', price: 22 });
    expect(result.headlineLink?.id).toBe('fresh-mid');
    expect(result.cheapestFreshLink?.id).toBe('fresh-mid');
    expect(result.isStale).toBe(false);
    expect(result.freshOffers).toEqual([
      { retailer: 'Coles', price: 25 },
      { retailer: 'Woolworths', price: 22 }
    ]);
  });

  it('picks the newest stale price and flags it stale when only stale prices exist', () => {
    const result = resolveCardPrice({
      links: [
        offer({
          id: 'older-cheaper',
          retailer: 'Kmart',
          latestPrice: 12,
          priceStale: true,
          latestAt: '2026-11-01T01:00:00.000Z'
        }),
        offer({
          id: 'newest-higher',
          retailer: 'Bunnings',
          latestPrice: 18.5,
          priceStale: true,
          latestAt: '2026-11-04T01:00:00.000Z'
        }),
        offer({
          id: 'middle',
          retailer: 'Big W',
          latestPrice: 15,
          priceStale: true,
          latestAt: '2026-11-02T01:00:00.000Z'
        })
      ]
    });

    expect(result.headline).toEqual({
      kind: 'stale',
      price: 18.5,
      lastSeenAt: '2026-11-04T01:00:00.000Z'
    });
    expect(result.headlineLink?.id).toBe('newest-higher');
    expect(result.cheapestFreshLink).toBeNull();
    expect(result.isStale).toBe(true);
    expect(result.freshOffers).toEqual([]);
  });

  it('shows the stale price when one shop is stale and another is unavailable', () => {
    const result = resolveCardPrice({
      links: [
        offer({
          id: 'out',
          retailer: 'Myer',
          stockStatus: 'unavailable',
          latestPrice: null,
          latestAt: '2026-11-20T01:00:00.000Z'
        }),
        offer({
          id: 'stale',
          retailer: 'Bunnings',
          latestPrice: 18.5,
          priceStale: true,
          latestAt: '2026-11-04T01:00:00.000Z'
        })
      ]
    });

    expect(result.allUnavailable).toBe(false);
    expect(result.headline).toEqual({
      kind: 'stale',
      price: 18.5,
      lastSeenAt: '2026-11-04T01:00:00.000Z'
    });
    expect(result.headlineLink?.id).toBe('stale');
    expect(result.cheapestFreshLink).toBeNull();
    expect(result.isStale).toBe(true);
  });

  it('reports unavailable when every active shop is unavailable even if a paused shop has a stale price', () => {
    const result = resolveCardPrice({
      links: [
        offer({
          id: 'out',
          retailer: 'Myer',
          stockStatus: 'unavailable',
          latestPrice: null,
          latestAt: '2026-11-20T01:00:00.000Z'
        }),
        offer({
          id: 'paused-stale',
          retailer: 'Bunnings',
          isActive: false,
          latestPrice: 18.5,
          priceStale: true,
          latestAt: '2026-11-04T01:00:00.000Z'
        })
      ]
    });

    expect(result.allUnavailable).toBe(true);
    expect(result.headline).toEqual({ kind: 'unavailable' });
    expect(result.headlineLink).toBeNull();
    expect(result.isStale).toBe(false);
  });

  it('formats the stale Last seen label with Sydney short date and year only when different', () => {
    const now = new Date('2026-11-23T00:00:00.000Z');
    const sameYear = resolveCardPrice({
      links: [
        offer({
          id: 'a',
          retailer: 'Bunnings',
          latestPrice: 18.5,
          priceStale: true,
          latestAt: '2026-11-04T01:00:00.000Z'
        })
      ]
    });
    const prevYear = resolveCardPrice({
      links: [
        offer({
          id: 'b',
          retailer: 'Bunnings',
          latestPrice: 18.5,
          priceStale: true,
          latestAt: '2025-11-04T01:00:00.000Z'
        })
      ]
    });

    expect(sameYear.headline.kind).toBe('stale');
    if (sameYear.headline.kind === 'stale') {
      expect(formatLastSeen(sameYear.headline.lastSeenAt, now)).toBe('4 Nov');
    }
    expect(prevYear.headline.kind).toBe('stale');
    if (prevYear.headline.kind === 'stale') {
      expect(formatLastSeen(prevYear.headline.lastSeenAt, now)).toBe('4 Nov 2025');
    }
  });
});

describe('shopGapLabel', () => {
  it('names the other shop when there are two prices', () => {
    expect(
      shopGapLabel(
        [
          { retailer: 'Coles', price: 14 },
          { retailer: 'Kmart', price: 15 }
        ],
        money
      )
    ).toBe('Kmart is $1.00 more');
  });

  it('does not describe the gap as money off a goal', () => {
    expect(
      shopGapLabel(
        [
          { retailer: 'Coles', price: 14 },
          { retailer: 'Kmart', price: 15 },
          { retailer: 'Big W', price: 14.5 }
        ],
        money
      )
    ).toBe('The highest shop is $1.00 more');
  });

  it('says nothing when there is only one price', () => {
    expect(shopGapLabel([{ retailer: 'Coles', price: 14 }], money)).toBeNull();
  });
});

describe('shopGapDetail', () => {
  it('returns the dearest shop, gap, url and full label for two offers', () => {
    expect(
      shopGapDetail(
        [
          { retailer: 'Coles', price: 14, url: 'https://www.coles.com.au/p/1' },
          { retailer: 'Woolworths', price: 14.95, url: 'https://www.woolworths.com.au/p/1' }
        ],
        money
      )
    ).toEqual({
      retailer: 'Woolworths',
      url: 'https://www.woolworths.com.au/p/1',
      gap: 0.9499999999999993,
      offerCount: 2,
      label: 'Woolworths is $0.95 more'
    });
  });

  it('uses the multi-shop sentence when three or more offers exist', () => {
    const result = shopGapDetail(
      [
        { retailer: 'Coles', price: 14 },
        { retailer: 'Kmart', price: 15 },
        { retailer: 'Big W', price: 14.5 }
      ],
      money
    );
    expect(result).toEqual({
      retailer: 'Kmart',
      url: undefined,
      gap: 1,
      offerCount: 3,
      label: 'The highest shop is $1.00 more'
    });
  });

  it('returns null when offers are equal or fewer than two', () => {
    expect(shopGapDetail([{ retailer: 'Coles', price: 14 }], money)).toBeNull();
    expect(
      shopGapDetail(
        [
          { retailer: 'Coles', price: 14 },
          { retailer: 'Woolworths', price: 14 }
        ],
        money
      )
    ).toBeNull();
  });
});
