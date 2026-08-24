'use client';

import { useEffect, useState } from 'react';

import CategorySection from '@/components/CategorySection';
import { sortCategoryGroups, type CategoryGroup } from '@/lib/productSort';

const PIN_STORAGE_KEY = 'pricetracker.pinnedCategories';

function readPinned(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(PIN_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export default function CategoryList({ groups }: { groups: CategoryGroup[] }) {
  const [pinned, setPinned] = useState<string[]>([]);

  useEffect(() => {
    setPinned(readPinned());
  }, []);

  function togglePin(category: string) {
    setPinned((current) => {
      const next = current.includes(category)
        ? current.filter((name) => name !== category)
        : [...current, category];
      window.localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  const ordered = sortCategoryGroups(groups, pinned);

  return (
    <div className="category-stack">
      {ordered.map((group) => {
        const isPinned = pinned.includes(group.category);
        const hasDeal = group.products.some(
          (product) =>
            product.targetPrice !== null &&
            product.lowestPrice !== null &&
            product.lowestPrice <= product.targetPrice
        );
        return (
          <CategorySection
            key={group.category}
            category={group.category}
            products={group.products}
            defaultOpen={isPinned || hasDeal}
            isPinned={isPinned}
            onTogglePin={() => togglePin(group.category)}
          />
        );
      })}
    </div>
  );
}
