'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import CategoryList from '@/components/CategoryList';
import DashboardHero from '@/components/DashboardHero';
import ForYouDigest from '@/components/ForYouDigest';
import HomeShortcuts from '@/components/HomeShortcuts';
import ProductDetailPanel from '@/components/ProductDetailPanel';
import ProductSearch from '@/components/ProductSearch';
import ThisWeekPanel from '@/components/ThisWeekPanel';
import type { CategoryLayout } from '@/lib/categoryLayout';
import { prefersReducedMotion } from '@/lib/motion';
import type { OverviewResponse } from '@/lib/overview';
import type { CategoryGroup } from '@/lib/productSort';
import { toTrackedSearchItems } from '@/lib/trackedSearch';
import type { ProductView } from '@/lib/types';

type DetailTransitionMode = 'open' | 'close' | 'switch';

function setCardTransitionNames(productId: string | null, enabled: boolean) {
  if (!productId || typeof document === 'undefined') return;
  const card = document.getElementById(`p-${productId}`);
  if (!card) return;
  const thumb = card.querySelector<HTMLElement>('.card-thumb-slot');
  const title = card.querySelector<HTMLElement>('.product-name');
  if (thumb) thumb.style.viewTransitionName = enabled ? 'pt-product-thumb' : '';
  if (title) title.style.viewTransitionName = enabled ? 'pt-product-title' : '';
}

function setPanelTransitionSuppressed(suppressed: boolean) {
  if (typeof document === 'undefined') return;
  const thumb = document.querySelector<HTMLElement>('.detail-panel-thumb');
  const title = document.querySelector<HTMLElement>('.detail-panel-title-copy h2');
  if (thumb) thumb.style.viewTransitionName = suppressed ? 'none' : '';
  if (title) title.style.viewTransitionName = suppressed ? 'none' : '';
}

let activeVtCardId: string | null = null;
let vtSequence = 0;

function runViewTransition(
  update: () => void,
  options?: { mode: DetailTransitionMode; productId: string; enabled: boolean }
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    update();
    return;
  }
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };
  if (
    prefersReducedMotion() ||
    (options && !options.enabled) ||
    typeof doc.startViewTransition !== 'function'
  ) {
    setCardTransitionNames(activeVtCardId, false);
    setPanelTransitionSuppressed(false);
    activeVtCardId = null;
    update();
    return;
  }

  setCardTransitionNames(activeVtCardId, false);
  setPanelTransitionSuppressed(false);

  const seq = ++vtSequence;
  const productId = options?.productId ?? null;
  const mode = options?.mode ?? null;
  activeVtCardId = productId;

  if (mode === 'open' && productId) {
    setCardTransitionNames(productId, true);
  } else if (mode === 'switch' && productId) {
    setPanelTransitionSuppressed(true);
    setCardTransitionNames(productId, true);
  }

  const transition = doc.startViewTransition(() => {
    if (mode === 'open' && productId) {
      setCardTransitionNames(productId, false);
      flushSync(update);
    } else if (mode === 'switch' && productId) {
      setCardTransitionNames(productId, false);
      setPanelTransitionSuppressed(false);
      flushSync(update);
    } else if (mode === 'close' && productId) {
      flushSync(update);
      setCardTransitionNames(productId, true);
    } else {
      flushSync(update);
    }
  });

  transition?.finished?.finally(() => {
    if (vtSequence !== seq) return;
    setCardTransitionNames(productId, false);
    setPanelTransitionSuppressed(false);
    activeVtCardId = null;
  });
}

export default function DashboardWorkspace({
  products,
  groups,
  savedLayout,
  isDemo,
  accountHref,
  loadError,
  initialOverview
}: {
  products: ProductView[];
  groups: CategoryGroup[];
  savedLayout: CategoryLayout | null;
  isDemo: boolean;
  accountHref: string | null;
  loadError: string | null;
  initialOverview?: OverviewResponse | null;
}) {
  const [overview, setOverview] = useState<OverviewResponse | null>(initialOverview ?? null);
  const [overviewStatus, setOverviewStatus] = useState<'loading' | 'ready' | 'error'>(
    initialOverview || products.length === 0 ? 'ready' : 'loading'
  );
  const [isWide, setIsWide] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  // Read through refs so the select handler stays the same between renders
  // and the memoised cards do not all re-render when one is picked.
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedProductId;
  const isWideRef = useRef(false);
  isWideRef.current = isWide;

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1200px)');
    const sync = () => setIsWide(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (initialOverview) {
      setOverview(initialOverview);
      setOverviewStatus('ready');
      return;
    }
    if (products.length === 0) {
      setOverviewStatus('ready');
      return;
    }
    const controller = new AbortController();
    setOverviewStatus('loading');
    fetch('/api/overview', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: OverviewResponse) => {
        setOverview(data);
        setOverviewStatus('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setOverviewStatus('error');
        }
      });
    return () => controller.abort();
  }, [products.length, initialOverview]);

  const selectedProduct = useMemo(
    () => (selectedProductId ? products.find((p) => p.id === selectedProductId) ?? null : null),
    [products, selectedProductId]
  );

  const trackedItems = useMemo(() => toTrackedSearchItems(products), [products]);

  const trackedUrls = useMemo(
    () => products.flatMap((product) => product.links.map((link) => link.url)),
    [products]
  );

  const closeDetail = useCallback(() => {
    const closingId = selectedIdRef.current;
    runViewTransition(
      () => {
        setSelectedProductId(null);
      },
      closingId ? { mode: 'close', productId: closingId, enabled: isWideRef.current } : undefined
    );
    window.requestAnimationFrame(() => {
      const target =
        lastTriggerRef.current && lastTriggerRef.current.isConnected
          ? lastTriggerRef.current
          : closingId
            ? (document.querySelector<HTMLElement>(`#p-${CSS.escape(closingId)} .card-open`) ??
              document.getElementById(`p-${closingId}`))
            : null;
      target?.focus({ preventScroll: true });
    });
  }, []);

  const handleToggleSelect = useCallback(
    (productId: string, triggerEl: HTMLElement | null) => {
      if (selectedIdRef.current === productId) {
        closeDetail();
        return;
      }
      const mode: DetailTransitionMode = selectedIdRef.current ? 'switch' : 'open';
      lastTriggerRef.current = triggerEl;
      runViewTransition(
        () => {
          setSelectedProductId(productId);
        },
        { mode, productId, enabled: isWideRef.current }
      );
    },
    [closeDetail]
  );

  const handleNavigateProduct = useCallback((productId: string) => {
    window.dispatchEvent(new CustomEvent('pt:reveal-product', { detail: productId }));
  }, []);

  return (
    <main className="dashboard-page">
      <DashboardHero
        products={products}
        accountHref={accountHref}
        showSummaryStrip
        overview={overview}
        overviewStatus={overviewStatus}
      />

      <ForYouDigest />

      <HomeShortcuts signedIn />

      <div className="dashboard-mobile-week">
        <ThisWeekPanel
          overview={overview}
          status={overviewStatus}
          products={products}
          collapsible
          onNavigateProduct={handleNavigateProduct}
        />
      </div>

      <ProductSearch
        isDemo={isDemo}
        trackedItems={trackedItems}
        trackedUrls={trackedUrls}
        enableSlashShortcut
        onSelectTracked={handleNavigateProduct}
      />

      {loadError ? (
        <div className="alert">
          Could not load products from Supabase: {loadError}
        </div>
      ) : null}

      <div className="dashboard-workspace">
        <div className="dashboard-main">
          {!loadError && products.length === 0 ? (
            <div className="card empty">
              <svg className="empty-illustration" viewBox="0 0 180 120" aria-hidden="true">
                <path d="M34 94 52 45h76l18 49" fill="var(--brand-soft)" stroke="var(--line)" strokeWidth="2" />
                <path d="M62 45c0-17 11-29 28-29s28 12 28 29" fill="none" stroke="var(--brand)" strokeWidth="5" strokeLinecap="round" />
                <circle cx="65" cy="76" r="6" fill="var(--brand)" opacity=".35" />
                <circle cx="115" cy="76" r="6" fill="var(--brand)" opacity=".35" />
              </svg>
              <h2>Nothing tracked yet</h2>
              <Link className="button" href="/manage">Add a product</Link>
            </div>
          ) : (
            <CategoryList
              groups={groups}
              savedLayout={savedLayout}
              readOnly={isDemo}
              singleColumnBoard
              sidePanelActive={isWide}
              selectedProductId={selectedProductId}
              onToggleSelect={handleToggleSelect}
            />
          )}
        </div>

        <div className="dashboard-aside">
          <div className="dashboard-aside-sticky">
            {isWide && selectedProduct ? (
              <ProductDetailPanel
                product={selectedProduct}
                readOnly={isDemo}
                onClose={closeDetail}
              />
            ) : (
              <ThisWeekPanel
                overview={overview}
                status={overviewStatus}
                products={products}
                onNavigateProduct={handleNavigateProduct}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
