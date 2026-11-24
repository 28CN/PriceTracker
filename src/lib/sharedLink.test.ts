import { describe, expect, it } from 'vitest';

import { addPathFor, cleanSharedTitle, parseSharedLink } from './sharedLink';

describe('parseSharedLink', () => {
  it('reads a bookmarklet link and title', () => {
    expect(
      parseSharedLink({
        url: 'https://www.kmart.com.au/product/desk-lamp-43251/?utm_source=x',
        title: 'Desk Lamp | Kmart'
      })
    ).toEqual({ status: 'ok', url: 'https://www.kmart.com.au/product/desk-lamp-43251', name: 'Desk Lamp' });
  });

  it('finds the link inside Android share text', () => {
    expect(
      parseSharedLink({ text: 'Bluey 8-inch Plush S1 https://toymate.com.au/bluey-8-inch-plush-s1/' })
    ).toEqual({ status: 'ok', url: 'https://toymate.com.au/bluey-8-inch-plush-s1', name: 'Bluey 8-inch Plush S1' });
  });

  it('refuses lists, bad links and nothing', () => {
    expect(parseSharedLink({ url: 'https://www.coles.com.au/on-special' }).status).toBe('listing');
    expect(parseSharedLink({ url: 'javascript:alert(1)' }).status).toBe('invalid');
    expect(parseSharedLink({ url: 'ftp://x.com/a' }).status).toBe('invalid');
    expect(parseSharedLink({}).status).toBe('empty');
  });

  it('uses the first value when a param repeats', () => {
    expect(parseSharedLink({ url: ['https://www.bigw.com.au/product/toy/p/123', 'x'] }).status).toBe('ok');
  });
});

describe('cleanSharedTitle', () => {
  it('drops the shop name and "Buy"', () => {
    expect(cleanSharedTitle('Buy Panadol 100 Tablets - Chemist Warehouse')).toBe('Panadol 100 Tablets');
    expect(cleanSharedTitle('Bluey S1 Jumbo Plush - Bingo | Toymate | Preschool')).toBe('Bluey S1 Jumbo Plush - Bingo');
  });
});

describe('addPathFor', () => {
  it('keeps only the share params', () => {
    expect(addPathFor({ url: 'https://a.com/p/1', title: 'A' })).toBe('/add?url=https%3A%2F%2Fa.com%2Fp%2F1&title=A');
    expect(addPathFor({})).toBe('/add');
  });
});
