import { describe, expect, it } from 'vitest';

import {
  DEAL_SHOPS,
  isDealLive,
  isNewDeal,
  matchDealsToProducts,
  postedAgoLabel,
  priceFromTitle,
  timeLeftLabel
} from './deals';

const NOW = Date.parse('2026-11-25T03:00:00Z');
const hours = (n: number) => new Date(NOW + n * 3_600_000).toISOString();

describe('priceFromTitle', () => {
  it.each([
    ['58% off Hydralyte Effervescent Tablets 40 Pack $11.00 @ Coles', '$11.00'],
    ['Vetta Pasta 500g Varieties $0.41 (Was $1.65) @ Coles', '$0.41'],
    ['PlayStation 5 Disc Console $999 + $9/$12 Delivery @ BIG W', '$999'],
    ['Garmin Fenix 8 Watch $1,198.84 Delivered @ RYDA', '$1,198.84'],
    ['$10 off $50 Click & Collect Spend @ Coles', null],
    ['Spend $200: $15 off @ Coles', null],
    ['Coles: $5 Bonus Cashback on Total of $200+ Spend', null],
    ['3000 Flybuys Points for $250+ Online Spend', null],
    ['Everyday Market: 25% Cashback on $300.01-$1000 Spend', null],
    ['Free LA Gum 60g at Woolworths', null],
    ['Was $20 now half price', null],
    ['Insta360 Luna Ultra Bundle $1248 + Delivery @ JB Hi-Fi', '$1248'],
    ['Chemist Warehouse: 50% Cashback (Capped at $9 per Member)', null],
    ['Up to 40% off Selected LEGO Sets + $8 Delivery @ Target', null],
    ['FiiO KA13 DAC US$51.13 (A$77.52) Delivered @ FiiO', '$77.52']
  ])('%s', (title, expected) => {
    expect(priceFromTitle(title)).toBe(expected);
  });
});

describe('time labels', () => {
  it('says how long is left', () => {
    expect(timeLeftLabel(null, NOW)).toBeNull();
    expect(timeLeftLabel(hours(-1), NOW)).toBe('Ended');
    expect(timeLeftLabel(hours(0.5), NOW)).toBe('Ends soon');
    expect(timeLeftLabel(hours(5), NOW)).toBe('Ends in 5h');
    expect(timeLeftLabel(hours(30), NOW)).toBe('Ends tomorrow');
    expect(timeLeftLabel(hours(24 * 6), NOW)).toBe('Ends in 6 days');
  });

  it('says when it was posted', () => {
    expect(postedAgoLabel(hours(-0.2), NOW)).toBe('Just now');
    expect(postedAgoLabel(hours(-5), NOW)).toBe('5h ago');
    expect(postedAgoLabel(hours(-30), NOW)).toBe('Yesterday');
    expect(postedAgoLabel(hours(-24 * 4), NOW)).toBe('4 days ago');
  });

  it('knows new and live deals', () => {
    expect(isNewDeal({ posted_at: hours(-3) }, NOW)).toBe(true);
    expect(isNewDeal({ posted_at: hours(-30) }, NOW)).toBe(false);
    expect(isDealLive({ expires_at: null }, NOW)).toBe(true);
    expect(isDealLive({ expires_at: hours(-1) }, NOW)).toBe(false);
    expect(isDealLive({ expires_at: hours(2) }, NOW)).toBe(true);
  });
});

describe('matchDealsToProducts', () => {
  const deals = [
    { node_id: 1, title: 'Tim Tam Original 200g $3.50 @ Coles' },
    { node_id: 2, title: "Arnott's Shapes Varieties $2 @ Woolworths" },
    { node_id: 3, title: 'Hot Wheels Super Rigs $9.60 @ Target' },
    { node_id: 4, title: 'Milo Malt Powder 1kg $11 @ Woolworths' },
    { node_id: 5, title: 'Tim Hortons Coffee $5 @ Coles' },
    { node_id: 6, title: 'Huggies Nappies Jumbo $30 @ Big W' }
  ];
  const products = [
    "Arnott's Tim Tam Original 200g",
    'Hot Wheels Super Rigs',
    'Milo Malt Powder 1kg',
    'Huggies Ultra Dry Nappies Boys Size 4 36 pack'
  ];

  it('finds deals for tracked products, also without the brand word', () => {
    const matches = matchDealsToProducts(deals, products);
    expect(matches.get(1)).toBe("Arnott's Tim Tam Original 200g");
    expect(matches.get(3)).toBe('Hot Wheels Super Rigs');
    expect(matches.get(4)).toBe('Milo Malt Powder 1kg');
  });

  it('does not match on one shared word', () => {
    const matches = matchDealsToProducts(deals, products);
    expect(matches.has(2)).toBe(false);
    expect(matches.has(5)).toBe(false);
    expect(matches.has(6)).toBe(false);
  });

  it('returns nothing without products', () => {
    expect(matchDealsToProducts(deals, []).size).toBe(0);
  });
});

describe('DEAL_SHOPS', () => {
  it('has unique keys in both tabs', () => {
    const keys = DEAL_SHOPS.map((shop) => shop.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(DEAL_SHOPS.filter((shop) => shop.tab === 'shops')).toHaveLength(9);
  });
});
