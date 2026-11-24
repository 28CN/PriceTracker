'use client';

import { ChevronDown, Pin, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type HTMLAttributes } from 'react';

import ProductList from '@/components/ProductList';
import { categoryTone, hitsTarget } from '@/lib/productSort';
import type { ProductView } from '@/lib/types';

export default function CategorySection({
  category,
  products,
  defaultOpen = false,
  isPinned = false,
  onTogglePin,
  isReordering = false,
  isDragging = false,
  readOnly = false,
  dragHandleProps,
  sidePanelActive = false,
  selectedProductId = null,
  onToggleSelect
}: {
  category: string;
  products: ProductView[];
  defaultOpen?: boolean;
  isPinned?: boolean;
  onTogglePin?: () => void;
  isReordering?: boolean;
  isDragging?: boolean;
  readOnly?: boolean;
  dragHandleProps?: HTMLAttributes<HTMLElement>;
  sidePanelActive?: boolean;
  selectedProductId?: string | null;
  onToggleSelect?: (productId: string, triggerEl: HTMLElement | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const wasPinned = useRef(isPinned);
  const tone = categoryTone(category);
  const dealCount = useMemo(() => products.filter(hitsTarget).length, [products]);
  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => Number(hitsTarget(b)) - Number(hitsTarget(a))),
    [products]
  );
  const showBody = isOpen && !isReordering;
  // Mount the list on first open, then only hide it, so photos and card
  // state are not thrown away on every collapse.
  const [hasOpened, setHasOpened] = useState(defaultOpen);
  if (showBody && !hasOpened) {
    setHasOpened(true);
  }

  // "/#p-<id>" from search or "This week": open this group, then bring the card into view.
  useEffect(() => {
    const timers = new Set<number>();
    function schedule(fn: () => void, ms: number) {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    }
    function revealById(id: string | undefined) {
      if (!id || !products.some((product) => product.id === id)) return;
      setIsOpen(true);
      schedule(() => {
        const card = document.getElementById(`p-${id}`);
        if (!card) return;
        const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        card.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
        card.classList.add('is-highlight');
        card.focus({ preventScroll: true });
        // Not tracked: the highlight must always clear, even after a re-render.
        window.setTimeout(() => card.classList.remove('is-highlight'), 1800);
      }, 350);
    }
    function revealFromHash() {
      const id = window.location.hash.match(/^#p-([\w-]+)$/)?.[1];
      revealById(id);
    }
    function revealFromEvent(event: Event) {
      const id = (event as CustomEvent<string>).detail;
      revealById(id);
    }
    revealFromHash();
    window.addEventListener('hashchange', revealFromHash);
    window.addEventListener('pt:reveal-product', revealFromEvent);
    return () => {
      window.removeEventListener('hashchange', revealFromHash);
      window.removeEventListener('pt:reveal-product', revealFromEvent);
      timers.forEach((timerId) => window.clearTimeout(timerId));
      timers.clear();
    };
  }, [products]);

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
            <ChevronDown
              className={`category-chevron${showBody ? ' is-open' : ''}`}
              size={16}
              aria-hidden="true"
            />
            <span className="category-name">{category}</span>
            <span className="category-count">
              {products.length} product{products.length === 1 ? '' : 's'}
            </span>
            {dealCount > 0 && !isReordering ? (
              <span className="category-deals">
                <Sparkles size={16} aria-hidden="true" />
                {dealCount} below goal
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
            <Pin className="pin-icon" size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {hasOpened ? (
        <div className={`category-body${showBody ? ' is-open' : ''}`} inert={!showBody} aria-hidden={!showBody}>
          <div className="category-body-inner">
            <ProductList
              products={sortedProducts}
              readOnly={readOnly}
              sidePanelActive={sidePanelActive}
              selectedProductId={selectedProductId}
              onToggleSelect={onToggleSelect}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
