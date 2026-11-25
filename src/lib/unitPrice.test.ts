import { describe, expect, it } from 'vitest';

import { formatUnitPrice, parseUnitSize, unitPriceFor } from './unitPrice';

describe('parseUnitSize', () => {
  it.each([
    ["Arnott's Tim Tam Original 200g", { kind: 'weight', grams: 200 }],
    ['Milo Malt Powder 1kg', { kind: 'weight', grams: 1000 }],
    ['Sanitarium Weet-Bix 1.2kg', { kind: 'weight', grams: 1200 }],
    ['Heinz Baked Beans 420 g', { kind: 'weight', grams: 420 }],
    ['Dairy Farmers Full Cream Milk 2L', { kind: 'volume', millilitres: 2000 }],
    ['Morning Fresh Dishwashing Liquid 900mL', { kind: 'volume', millilitres: 900 }],
    ['Coca-Cola 1.25 Litre', { kind: 'volume', millilitres: 1250 }],
    ['Coke Zero Cans 24 x 375mL', { kind: 'volume', millilitres: 9000 }],
    ['Uncle Tobys Oats 6x40g', { kind: 'weight', grams: 240 }],
    ['Energizer Max AA Batteries 16 pack', { kind: 'count', items: 16 }],
    ['Kleenex Complete Clean Toilet Paper 12 pack', { kind: 'count', items: 12 }],
    ["L'OR Espresso Ristretto Pods 10 pack", { kind: 'count', items: 10 }],
    ['Panadol 20 tablets', { kind: 'count', items: 20 }],
    ['Dishwasher tabs, pack of 60', { kind: 'count', items: 60 }]
  ])('%s', (name, expected) => {
    expect(parseUnitSize(name)).toEqual(expected);
  });

  it('reads the pack count, not the nappy size', () => {
    expect(parseUnitSize('Huggies Ultra Dry Nappies Boys Size 4 36 pack')).toEqual({ kind: 'count', items: 36 });
  });

  it('prefers weight over a count when a name has both', () => {
    expect(parseUnitSize('Lipton Tea Bags 100 pack 200g')).toEqual({ kind: 'weight', grams: 200 });
  });

  it.each([
    'LEGO Minifigures Series 29',
    'Hot Wheels Basic Car',
    'Philips 4 Levels Lamp',
    'Model 3L-X adaptor',
    'Size 4',
    '1 pack',
    'Bucket 0L'
  ])('returns null for %s', (name) => {
    expect(parseUnitSize(name)).toBeNull();
  });
});

describe('unitPriceFor', () => {
  it('prices weight per 100g, volume per litre, packs each', () => {
    expect(unitPriceFor('Milo 1kg', 12)).toEqual({ value: 1.2, per: '100g' });
    expect(unitPriceFor('Milk 2L', 3.1)).toEqual({ value: 1.55, per: 'L' });
    expect(unitPriceFor('Batteries 16 pack', 20)).toEqual({ value: 1.25, per: 'each' });
  });

  it('returns null without a usable price or size', () => {
    expect(unitPriceFor('Milo 1kg', null)).toBeNull();
    expect(unitPriceFor('Milo 1kg', 0)).toBeNull();
    expect(unitPriceFor('Hot Wheels Basic Car', 2)).toBeNull();
  });
});

describe('formatUnitPrice', () => {
  it('writes short, readable unit prices', () => {
    expect(formatUnitPrice({ value: 1.2, per: '100g' })).toBe('$1.20 / 100g');
    expect(formatUnitPrice({ value: 1.55, per: 'L' })).toBe('$1.55 / L');
    expect(formatUnitPrice({ value: 0.4, per: 'each' })).toBe('$0.40 each');
    expect(formatUnitPrice({ value: 0.0526, per: '100g' })).toBe('$0.053 / 100g');
  });
});
