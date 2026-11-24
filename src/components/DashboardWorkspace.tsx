'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import CategoryList from '@/components/CategoryList';
import DashboardHero from '@/components/DashboardHero';
import ProductDetailPanel from '@/components/ProductDetailPanel';
import ProductSearch from '@/components/ProductSearch';
import ThisWeekPanel from '@/components/ThisWeekPanel';
import type { CategoryLayout } from '@/lib/categoryLayout';
import type { OverviewResponse } from '@/lib/overview';
import type { CategoryGroup } from '@/lib/productSort';
import { toTrackedSearchItems } from '@/lib/trackedSearch';
import type { ProductView } from '@/lib/types';

function runViewTransition(update: () => void) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    update();
    return;
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };
  if (reduced || typeof doc.startViewTransition !== 'function') {
    update();
    return;
  }
  doc.startViewTransition(() => {
    flushSync(update);
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
  // Read through a ref so the select handler stays the same between renders
  // and the memoised cards do not all re-render when one is picked.
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedProductId;

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
    runViewTransition(() => {
      setSelectedProductId(null);
    });
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
      lastTriggerRef.current = triggerEl;
      runViewTransition(() => {
        setSelectedProductId(productId);
      });
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
