import { describe, expect, it } from 'vitest';

import { brandInTitle, brandsForProducts } from './dealBrands';

const labels = (products: Parameters<typeof brandsForProducts>[0]) => brandsForProducts(products).map((b) => b.label);

describe('brandsForProducts', () => {
  it('finds brands in names and in shop link slugs', () => {
    expect(
      labels([
        {
          name: 'Basic Car',
          links: [
            {
              url: 'https://www.kmart.com.au/product/hot-wheels-basic-car-assorted-5621682/'
            }
          ]
        },
        {
          name: '不锈钢水杯350ml',
          links: [
            {
              url: 'https://www.bigw.com.au/product/b-box-insulated-drink-bottle-350ml-bluey-playtime/p/6081269'
            }
          ]
        },
        {
          name: 'Super rigs',
          links: [{ url: 'https://www.toymate.com.au/hotwheels-super-rigs/' }]
        }
      ]).sort()
    ).toEqual(['B.Box', 'Bluey', 'Hot Wheels']);
  });

  it('reads the group name too', () => {
    expect(labels([{ name: 'Power Grab', categoryName: 'Matchbox' }])).toEqual(['Matchbox']);
  });

  it('maps characters to their show', () => {
    expect(
      labels([
        {
          name: 'Drink bottle',
          links: [
            {
              url: 'https://www.bigw.com.au/product/b-box-tritan-drink-bottle-450ml-bingo/p/1'
            }
          ]
        }
      ])
    ).toContain('Bluey');
  });

  it('counts a shared first word as a brand, but not generic words or shop brands', () => {
    expect(labels([{ name: 'Zoggs Goggles' }, { name: 'Zoggs Cap' }])).toEqual(['Zoggs']);
    expect(labels([{ name: 'Zoggs Goggles' }])).toEqual([]);
    expect(labels([{ name: 'Coles Milk 2L' }, { name: 'Coles Bread' }])).toEqual([]);
    expect(labels([{ name: 'Original Biscuits' }, { name: 'Original Chips' }])).toEqual([]);
    expect(labels([{ name: "Arnott's Tim Tam 200g" }, { name: "Arnott's Shapes" }])).toEqual(["Arnott's", 'Tim Tam']);
  });
});

describe('brandInTitle', () => {
  const brands = brandsForProducts([
    { name: 'Hot Wheels Basic Car' },
    { name: "Arnott's Lemon Crisp" },
    { name: 'Bluey bottle' }
  ]);

  it('matches whole words, with or without the space or apostrophe', () => {
    expect(brandInTitle('Hot Wheels Monster Trucks 5-Pack $15 @ Kmart', brands)).toBe('Hot Wheels');
    expect(brandInTitle('HotWheels Track Builder $20 @ Big W', brands)).toBe('Hot Wheels');
    expect(brandInTitle('Arnotts Shapes 175g $2 @ Coles', brands)).toBe("Arnott's");
    expect(brandInTitle('Bluey Toys up to 50% off @ Target', brands)).toBe('Bluey');
  });

  it('ignores the brand inside other words and unrelated deals', () => {
    expect(brandInTitle('Blueys Bakery Cookies @ Woolworths', brands)).toBeNull();
    expect(brandInTitle('Wheels for Hot Cars @ Repco', brands)).toBeNull();
    expect(brandInTitle('$10 off $50 Spend @ Coles', brands)).toBeNull();
  });

  it('matches a brand found from shared first words exactly', () => {
    const derived = brandsForProducts([{ name: "Pic's Peanut Butter" }, { name: "Pic's Jam" }]);
    expect(brandInTitle("Pic's Peanut Butter 380g $5 @ Coles", derived)).toBe("Pic's");
    expect(brandInTitle('Instax film for 100 pics $50 @ Amazon AU', derived)).toBeNull();
  });

  it('names the earliest brand in the title', () => {
    expect(brandInTitle('Bluey x Hot Wheels Car @ Kmart', brands)).toBe('Bluey');
  });
});
