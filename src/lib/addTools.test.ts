import { describe, expect, it } from 'vitest';

import { bookmarkletFor, SPECIALS_LINKS } from './addTools';
import { looksLikeProductPage } from './productUrl';

describe('bookmarkletFor', () => {
  it('only sends the browser to /add with the link and title', () => {
    const code = bookmarkletFor('https://pricetracker-au.vercel.app/');
    expect(code.startsWith('javascript:')).toBe(true);
    expect(code).toContain('"https://pricetracker-au.vercel.app/add?url="');
    expect(code).not.toMatch(/fetch|XMLHttpRequest|cookie|localStorage|sendBeacon|innerHTML/);

    let href = '';
    const location = { href: 'https://www.kmart.com.au/product/lamp-1/?a=1&b=2' };
    new Function('location', 'document', code.slice('javascript:'.length))(location, { title: 'Lamp & Shade | Kmart' });
    href = location.href;
    const url = new URL(href);
    expect(url.pathname).toBe('/add');
    expect(url.searchParams.get('url')).toBe('https://www.kmart.com.au/product/lamp-1/?a=1&b=2');
    expect(url.searchParams.get('title')).toBe('Lamp & Shade | Kmart');
  });
});

describe('SPECIALS_LINKS', () => {
  it('are https sale pages, never product pages', () => {
    for (const link of SPECIALS_LINKS) {
      expect(link.href.startsWith('https://')).toBe(true);
      expect(looksLikeProductPage(link.href)).toBe(false);
    }
  });
});
