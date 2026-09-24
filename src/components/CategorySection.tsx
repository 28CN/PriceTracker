'use client';

import { useEffect, useRef, useState, type HTMLAttributes } from 'react';

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
  onTogglePin,
  isReordering = false,
  isDragging = false,
  dragHandleProps
}: {
  category: string;
  products: ProductView[];
  defaultOpen?: boolean;
  isPinned?: boolean;
  onTogglePin?: () => void;
  isReordering?: boolean;
  isDragging?: boolean;
  dragHandleProps?: HTMLAttributes<HTMLElement>;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const wasPinned = useRef(isPinned);
  const tone = categoryTone(category);
  const dealCount = products.filter(hitsTarget).length;
  const showBody = isOpen && !isReordering;

  useEffect(() => {
    if (isPinned && !wasPinned.current) {
      setIsOpen(true);
    }
    wasPinned.current = isPinned;
  }, [isPinned]);

  return (
    <section
      className={`category-section ${tone} ${showBody ? 'is-open' : 'is-collapsed'}${
        isReordering ? ' is-reorder-row' : ''
      }${isDragging ? ' is-dragging' : ''}`}
      data-category={category}
      {...dragHandleProps}
    >
      <div className="category-head">
        <button
          type="button"
          className="category-toggle"
          onClick={() => {
            if (isReordering) {
              return;
            }
            setIsOpen((current) => !current);
          }}
          aria-expanded={showBody}
        >
          <span className="category-toggle-main">
            <span className="category-chevron" aria-hidden>
              {showBody ? '▾' : '▸'}
            </span>
            <span className="category-name">{category}</span>
            <span className="category-count">
              {products.length} product{products.length === 1 ? '' : 's'}
            </span>
            {dealCount > 0 && !isReordering ? (
              <span className="category-deals">
                {dealCount} under target
              </span>
            ) : null}
          </span>
        </button>
        {onTogglePin ? (
          <button
            type="button"
            className={`category-pin${isPinned ? ' is-pinned' : ''}`}
            onClick={onTogglePin}
            onPointerDown={(event) => event.stopPropagation()}
            aria-pressed={isPinned}
            aria-label={isPinned ? 'Unpin category' : 'Pin category'}
            title={isPinned ? 'Unpin' : 'Pin to top'}
          >
            <svg className="pin-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"
              />
            </svg>
          </button>
        ) : null}
      </div>

      {showBody ? (
        <div className="category-body">
          <ProductList products={products} />
        </div>
      ) : null}
    </section>
  );
}
