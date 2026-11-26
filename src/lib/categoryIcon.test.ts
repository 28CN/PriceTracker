import { describe, expect, it } from 'vitest';

import { categoryIconKey } from './categoryIcon';

describe('categoryIconKey', () => {
  it('matches common shopping categories by keyword', () => {
    expect(categoryIconKey('Household')).toBe('household');
    expect(categoryIconKey('Kitchen & Cleaning')).toBe('household');
    expect(categoryIconKey('Pantry staples')).toBe('pantry');
    expect(categoryIconKey('Coffee & Snacks')).toBe('pantry');
    expect(categoryIconKey('Toys')).toBe('toys');
    expect(categoryIconKey('Bluey')).toBe('toys');
    expect(categoryIconKey('Hotwheels')).toBe('cars');
    expect(categoryIconKey('Matchbox')).toBe('cars');
    expect(categoryIconKey('Baby')).toBe('baby');
    expect(categoryIconKey('Pets')).toBe('pets');
    expect(categoryIconKey('Pharmacy & Beauty')).toBe('health');
    expect(categoryIconKey('Electronics')).toBe('tech');
    expect(categoryIconKey('Garden & Tools')).toBe('hardware');
    expect(categoryIconKey('Clothing')).toBe('clothing');
    expect(categoryIconKey('Books & Stationery')).toBe('books');
  });

  it('defaults to tag for unknown or empty category names', () => {
    expect(categoryIconKey('Uncategorised')).toBe('tag');
    expect(categoryIconKey('Wishlist')).toBe('tag');
    expect(categoryIconKey('')).toBe('tag');
    expect(categoryIconKey(null)).toBe('tag');
  });
});
