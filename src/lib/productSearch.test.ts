import { describe, expect, it } from 'vitest';

import {
  cacheKeyForQuery,
  isSupportedShopName,
  matchCachedShopHits,
  normalizeQuery,
  parseShoppingResults,
  parseStores,
  type CacheSearchRow
} from './productSearch';

describe('normalizeQuery & cacheKeyForQuery', () => {
  it('lowercases and collapses punctuation', () => {
    expect(normalizeQuery('  Hot   Wheels!! 10-Pack ')).toBe('hot wheels 10-pack');
  });

  it('normalises cache keys so spacing and punctuation variants share one entry', () => {
    expect(cacheKeyForQuery('hot wheels')).toBe('q:hotwheels');
    expect(cacheKeyForQuery('hotwheels')).toBe('q:hotwheels');
    expect(cacheKeyForQuery('Hot-Wheels!')).toBe('q:hotwheels');
  });
});

describe('isSupportedShopName', () => {
  it('matches Google shop names to crawled shops', () => {
    expect(isSupportedShopName('BIG W')).toBe(true);
    expect(isSupportedShopName('Coles Supermarkets')).toBe(true);
    expect(isSupportedShopName('Kogan.com')).toBe(false);
    expect(isSupportedShopName('Mr Toys Toyworld')).toBe(true);
    expect(isSupportedShopName('Cash Converters')).toBe(false);
  });
});

describe('parseShoppingResults', () => {
  it('keeps the fields we need and puts supported shops first', () => {
    const hits = parseShoppingResults({
      shopping_results: [
        { product_id: '11', title: 'Car A', source: 'Kogan.com', extracted_price: 9, thumbnail: 'https://x/a.jpg', immersive_product_page_token: 'ta' },
        { product_id: '22', title: 'Car B', source: 'Kmart', extracted_price: 15, thumbnail: 'http://x/b.jpg', immersive_product_page_token: 'tb' },
        { product_id: '22', title: 'Dup', source: 'Kmart' },
        { title: 'No id', source: 'Kmart' }
      ]
    });
    expect(hits.map((h) => [h.id, h.shop, h.supported])).toEqual([
      ['22', 'Kmart', true],
      ['11', 'Kogan.com', false]
    ]);
    expect(hits[0].imageUrl).toBeNull();
    expect(hits[1]).toMatchObject({ price: 9, imageUrl: 'https://x/a.jpg', token: 'ta' });
  });
});

describe('parseStores', () => {
  it('cleans retailer links and flags the ones we can track', () => {
    const offers = parseStores({
      product_results: {
        stores: [
          { name: 'Amazon AU', link: 'https://www.amazon.com.au/x/dp/B000', extracted_price: 15 },
          {
            name: 'Kmart',
            link: 'https://www.kmart.com.au/product/hot-wheels-10-pack-87995756/?utm_source=google&srsltid=abc',
            extracted_price: 15
          }
        ]
      }
    });
    expect(offers[0]).toEqual({
      shop: 'Kmart',
      url: 'https://www.kmart.com.au/product/hot-wheels-10-pack-87995756',
      price: 15,
      trackable: true
    });
    expect(offers[1]).toMatchObject({ shop: 'Amazon AU', trackable: false });
  });
});

describe('matchCachedShopHits', () => {
  const now = new Date('2026-11-23T08:00:00Z').getTime();
  const rows: CacheSearchRow[] = [
    {
      query_key: 'q:hot wheels',
      fetched_at: '2026-11-05T04:00:00Z', // stale (>24h)
      results: [
        { id: '1', name: 'Hot Wheels 5-Pack Cars', price: 12, imageUrl: null, shop: 'Kmart', token: 't1', supported: true },
        { id: '2', name: 'Hot Wheels Track Builder', price: 29, imageUrl: null, shop: 'Big W', token: 't2', supported: true }
      ]
    },
    {
      query_key: 'q:hotwheels',
      fetched_at: '2026-11-23T06:00:00Z', // fresh (2h ago)
      results: [
        { id: '1', name: 'Hot Wheels 5-Pack Cars', price: 10, imageUrl: null, shop: 'Kmart', token: 't1', supported: true }
      ]
    }
  ];

  it('matches fuzzily across spacing/plurals, deduplicates keeping newest, and flags stale rows', () => {
    const hits = matchCachedShopHits('hotwheels', rows, now);
    expect(hits).toHaveLength(2);
    const pack = hits.find((h) => h.id === '1');
    const track = hits.find((h) => h.id === '2');
    expect(pack).toMatchObject({ price: 10, stale: false, fetchedAt: '2026-11-23T06:00:00Z' });
    expect(track).toMatchObject({ price: 29, stale: true, fetchedAt: '2026-11-05T04:00:00Z' });
  });

  it('matches plural/singular queries against stale cache rows', () => {
    const hits = matchCachedShopHits('car', rows, now);
    expect(hits.map((h) => h.id)).toEqual(['1']);
  });
});
