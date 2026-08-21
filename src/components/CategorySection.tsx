'use client';

import { useState } from 'react';

import ProductList from '@/components/ProductList';
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
  defaultOpen = false
}: {
  category: string;
  products: ProductView[];
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const tone = categoryTone(category);

  return (
    <section className={`category-section ${tone} ${isOpen ? 'is-open' : 'is-collapsed'}`}>
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
        </span>
        <span className="category-toggle-hint">{isOpen ? 'Collapse' : 'Expand'}</span>
      </button>

      {isOpen ? (
        <div className="category-body">
          <ProductList products={products} />
        </div>
      ) : null}
    </section>
  );
}
