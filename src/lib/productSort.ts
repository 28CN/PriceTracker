import type { ProductView } from '@/lib/types';

export function hitsTarget(product: ProductView): boolean {
  return (
    product.targetPrice !== null &&
    product.lowestPrice !== null &&
    product.lowestPrice <= product.targetPrice
  );
}

export function sortProducts(products: ProductView[]): ProductView[] {
  return [...products].sort((a, b) => {
    const hitDelta = Number(hitsTarget(b)) - Number(hitsTarget(a));
    if (hitDelta !== 0) {
      return hitDelta;
    }
    return a.name.localeCompare(b.name);
  });
}

export type CategoryGroup = {
  category: string;
  products: ProductView[];
};

/** Pinned keep their saved order; others use otherOrder, then deals, then name. */
export function sortCategoryGroups(
  groups: CategoryGroup[],
  pinned: string[],
  otherOrder: string[] = []
): CategoryGroup[] {
  const pinRank = new Map(pinned.map((name, index) => [name, index]));
  const otherRank = new Map(otherOrder.map((name, index) => [name, index]));

  return [...groups].sort((a, b) => {
    const aPinned = pinRank.has(a.category);
    const bPinned = pinRank.has(b.category);
    if (aPinned && bPinned) {
      return (pinRank.get(a.category) ?? 0) - (pinRank.get(b.category) ?? 0);
    }
    if (aPinned !== bPinned) {
      return aPinned ? -1 : 1;
    }

    const aOther = otherRank.has(a.category);
    const bOther = otherRank.has(b.category);
    if (aOther && bOther) {
      return (otherRank.get(a.category) ?? 0) - (otherRank.get(b.category) ?? 0);
    }
    if (aOther !== bOther) {
      return aOther ? -1 : 1;
    }

    const aHit = a.products.some(hitsTarget);
    const bHit = b.products.some(hitsTarget);
    if (aHit !== bHit) {
      return aHit ? -1 : 1;
    }

    if (a.category === 'Uncategorised') return 1;
    if (b.category === 'Uncategorised') return -1;
    return a.category.localeCompare(b.category);
  });
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function syncOrderList(preferred: string[], present: string[]): string[] {
  const presentSet = new Set(present);
  const kept = preferred.filter((name) => presentSet.has(name));
  const missing = present.filter((name) => !kept.includes(name));
  return [...kept, ...missing];
}
