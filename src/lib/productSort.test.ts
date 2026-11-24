import { describe, expect, it } from 'vitest';

import {
  categoryTone,
  groupProductsByCategory,
  hitsTarget,
  moveItem,
  sortCategoryGroups,
  sortProducts,
  syncOrderList
} from './productSort';
import type { ProductView } from './types';

function makeProduct(partial: Partial<ProductView> & { id: string; name: string }): ProductView {
  return {
    categoryId: null,
    categoryName: null,
    targetPrice: null,
    imageUrl: null,
    lowestPrice: null,
    lowestRetailer: null,
    links: [],
    ...partial
  };
}

describe('categoryTone', () => {
  it('returns a deterministic tone class for a category name', () => {
    const first = categoryTone('Toys');
    expect(first).toMatch(/^tone-(mint|sky|peach|lilac|sand|rose|teal)$/);
    expect(categoryTone('Toys')).toBe(first);
    expect(categoryTone('')).toBe('tone-mint');
  });
});

describe('groupProductsByCategory', () => {
  it('groups products by category name, defaulting missing names to Uncategorised, and sorts items within each group', () => {
    const products = [
      makeProduct({ id: '1', name: 'Zebra', categoryName: 'Toys', targetPrice: 10, lowestPrice: 12 }),
      makeProduct({ id: '2', name: 'Apple', categoryName: 'Toys', targetPrice: 10, lowestPrice: 12 }),
      makeProduct({ id: '3', name: 'Deal Car', categoryName: 'Toys', targetPrice: 10, lowestPrice: 8 }),
      makeProduct({ id: '4', name: 'Soap', categoryName: null })
    ];

    const groups = groupProductsByCategory(products);
    expect(groups.map((g) => g.category)).toEqual(['Toys', 'Uncategorised']);
    expect(groups[0].products.map((p) => p.id)).toEqual(['3', '2', '1']);
    expect(groups[1].products.map((p) => p.id)).toEqual(['4']);
  });
});

describe('productSort helpers', () => {
  it('detects products at or below goal price', () => {
    expect(hitsTarget(makeProduct({ id: '1', name: 'A', targetPrice: 10, lowestPrice: 10 }))).toBe(true);
    expect(hitsTarget(makeProduct({ id: '2', name: 'B', targetPrice: 10, lowestPrice: 9.5 }))).toBe(true);
    expect(hitsTarget(makeProduct({ id: '3', name: 'C', targetPrice: 10, lowestPrice: 10.5 }))).toBe(false);
    expect(hitsTarget(makeProduct({ id: '4', name: 'D', targetPrice: null, lowestPrice: 5 }))).toBe(false);
  });

  it('sorts products with deals first then alphabetically', () => {
    const sorted = sortProducts([
      makeProduct({ id: '1', name: 'Beta', targetPrice: 10, lowestPrice: 12 }),
      makeProduct({ id: '2', name: 'Alpha', targetPrice: 10, lowestPrice: 12 }),
      makeProduct({ id: '3', name: 'Gamma', targetPrice: 10, lowestPrice: 9 })
    ]);
    expect(sorted.map((p) => p.id)).toEqual(['3', '2', '1']);
  });

  it('orders pinned, otherOrder, deals, alphabetical, and Uncategorised last', () => {
    const groups = [
      { category: 'Uncategorised', products: [makeProduct({ id: '1', name: 'U' })] },
      { category: 'Pantry', products: [makeProduct({ id: '2', name: 'P' })] },
      { category: 'Toys', products: [makeProduct({ id: '3', name: 'T' })] }
    ];
    expect(sortCategoryGroups(groups, ['Pantry'], []).map((g) => g.category)).toEqual([
      'Pantry',
      'Toys',
      'Uncategorised'
    ]);
  });

  it('moves items and syncs order lists without mutating inputs', () => {
    const list = ['a', 'b', 'c'];
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(list).toEqual(['a', 'b', 'c']);
    expect(syncOrderList(['c', 'missing', 'a'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
  });
});
