import { describe, expect, it } from 'vitest';

import { isSupportedShopName, normalizeQuery, parseShoppingResults, parseStores } from './productSearch';

describe('normalizeQuery', () => {
  it('lowercases and collapses punctuation', () => {
    expect(normalizeQuery('  Hot   Wheels!! 10-Pack ')).toBe('hot wheels 10-pack');
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
