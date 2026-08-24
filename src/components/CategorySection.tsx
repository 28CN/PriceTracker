'use client';

import { useEffect, useRef, useState } from 'react';

import ProductList from '@/components/ProductList';
import { hitsTarget } from '@/lib/productSort';
import type { ProductView } from '@/lib/types';

const CATEGORY_TONES = [
  'tone-mint',
  'tone-sky',
  'tone-peach',
  'tone-lilac',
  'tone-sand',
  'tone-rose',
  'tone-teal'
] as const;

function categoryTone(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return CATEGORY_TONES[hash % CATEGORY_TONES.length];
}

export default function CategorySection({
  category,
  products,
  defaultOpen = false,
  isPinned = false,
  onTogglePin
}: {
  category: string;
  products: ProductView[];
  defaultOpen?: boolean;
  isPinned?: boolean;
  onTogglePin?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const wasPinned = useRef(isPinned);
  const tone = categoryTone(category);
  const dealCount = products.filter(hitsTarget).length;

  useEffect(() => {
    if (isPinned && !wasPinned.current) {
      setIsOpen(true);
    }
    wasPinned.current = isPinned;
  }, [isPinned]);

  return (
    <section className={`category-section ${tone} ${isOpen ? 'is-open' : 'is-collapsed'}`}>
      <div className="category-head">
        <button
          type="button"
          className="category-toggle"
          onClick={() => setIsOpen((current) => !current)}
          aria-expanded={isOpen}
        >
          <span className="category-toggle-main">
            <span className="category-chevron" aria-hidden>
              {isOpen ? '▾' : '▸'}
            </span>
            <span className="category-name">{category}</span>
            <span className="category-count">
              {products.length} product{products.length === 1 ? '' : 's'}
            </span>
            {dealCount > 0 ? (
              <span className="category-deals">
                {dealCount} under target
              </span>
            ) : null}
          </span>
          <span className="category-toggle-hint">{isOpen ? 'Collapse' : 'Expand'}</span>
        </button>
        {onTogglePin ? (
          <button
            type="button"
            className={`category-pin${isPinned ? ' is-pinned' : ''}`}
            onClick={onTogglePin}
            aria-pressed={isPinned}
            title={isPinned ? 'Unpin this category' : 'Pin to top and keep expanded'}
          >
            {isPinned ? 'Pinned' : 'Pin'}
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <div className="category-body">
          <ProductList products={products} />
        </div>
      ) : null}
    </section>
  );
}
