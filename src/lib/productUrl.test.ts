import { describe, expect, it } from 'vitest';

import { cleanHttpUrl, firstUrlIn, looksLikeProductPage } from './productUrl';

describe('cleanHttpUrl', () => {
  it('drops tracking, the hash and the trailing slash', () => {
    expect(cleanHttpUrl('https://WWW.Coles.com.au/product/x-123/?utm_source=a&gclid=b&size=2#top')).toBe(
      'https://www.coles.com.au/product/x-123?size=2'
    );
  });

  it('refuses anything but http and https', () => {
    expect(cleanHttpUrl('javascript:alert(1)')).toBeNull();
    expect(cleanHttpUrl('not a link')).toBeNull();
  });
});

describe('looksLikeProductPage', () => {
  it('accepts normal product pages', () => {
    expect(looksLikeProductPage('https://www.coles.com.au/product/coles-milk-2l-123')).toBe(true);
    expect(looksLikeProductPage('https://www.woolworths.com.au/shop/productdetails/123/milk')).toBe(true);
  });

  it('refuses search and group pages', () => {
    expect(looksLikeProductPage('https://www.coles.com.au/on-special')).toBe(false);
    expect(looksLikeProductPage('https://www.woolworths.com.au/shop/search/products?searchTerm=milk')).toBe(false);
    expect(looksLikeProductPage('https://www.kmart.com.au/category/toys')).toBe(false);
    expect(looksLikeProductPage('https://www.bigw.com.au/')).toBe(false);
  });

  it('accepts Toymate one-slug products', () => {
    expect(looksLikeProductPage('https://toymate.com.au/bluey-8-inch-plush-s1/')).toBe(true);
    expect(looksLikeProductPage('https://toymate.com.au/bluey-talking-sound-effects-beach-plush/')).toBe(true);
    expect(looksLikeProductPage('https://www.toymate.com.au/bluey-friends-plush-s15')).toBe(true);
  });

  it('refuses Toymate groups', () => {
    expect(looksLikeProductPage('https://toymate.com.au/paw-patrol/')).toBe(false);
    expect(looksLikeProductPage('https://toymate.com.au/pre-order-coming-soon/')).toBe(false);
    expect(looksLikeProductPage('https://toymate.com.au/outdoor-games-sports/')).toBe(false);
    expect(looksLikeProductPage('https://toymate.com.au/brand-shop/bluey/bluey-plush/')).toBe(false);
    expect(looksLikeProductPage('https://toymate.com.au/sale/')).toBe(false);
  });
});

describe('firstUrlIn', () => {
  it('finds the link in shared text', () => {
    expect(firstUrlIn('Look at this! https://www.kmart.com.au/product/lamp-123/.')).toBe(
      'https://www.kmart.com.au/product/lamp-123'
    );
    expect(firstUrlIn('no link here')).toBeNull();
  });
});

describe('looksLikeProductPage specials pages', () => {
  it('refuses the weekly specials pages', () => {
    expect(looksLikeProductPage('https://www.woolworths.com.au/shop/browse/specials/half-price')).toBe(false);
    expect(looksLikeProductPage('https://www.coles.com.au/on-special/meat')).toBe(false);
  });
});
