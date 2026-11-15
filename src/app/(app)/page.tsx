import Link from 'next/link';
import { headers } from 'next/headers';

import CategoryList from '@/components/CategoryList';
import DashboardHero from '@/components/DashboardHero';
import GuestLanding from '@/components/GuestLanding';
import ProductSearch from '@/components/ProductSearch';
import { getViewer } from '@/lib/auth';
import { fetchCategoryLayout, type CategoryLayout } from '@/lib/categoryLayout';
import { sortProducts } from '@/lib/productSort';
import { fetchProducts } from '@/lib/queries';
import { rememberServerTiming } from '@/lib/installServerTiming';
import { serverTimingHeader } from '@/lib/serverTiming';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ProductView } from '@/lib/types';

// Prices change behind the scenes, so never serve a cached snapshot. Marking the
// route dynamic is not enough on its own: Vercel's Data Cache would still answer
// the Supabase queries from an old snapshot, and it outlives redeploys.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

async function loadList(userId: string) {
  const supabase = await createServerSupabaseClient();
  const [products, layout] = await Promise.all([
    fetchProducts(supabase, userId),
    fetchCategoryLayout(supabase, userId)
  ]);
  return { products, layout };
}

export default async function HomePage() {
  const started = performance.now();
  const headerList = await headers();
  const authMs = Number(headerList.get('x-pt-auth-ms') || 0);
  const requestId = headerList.get('x-pt-req') || '';
  const marker = headerList.get('x-pt-auth');

  if (marker === 'anon') {
    rememberServerTiming(requestId, serverTimingHeader({ auth: authMs, list: 0, render: performance.now() - started }));
    return <GuestLanding />;
  }

  const listStarted = performance.now();
  // Profile and the product list both need the database. Start them together.
  const viewerPromise = getViewer();
  let products: ProductView[] = [];
  let loadError: string | null = null;
  let layout: CategoryLayout | null = null;

  try {
    if (marker) {
      const [loaded] = await Promise.all([loadList(marker), viewerPromise]);
      products = loaded.products;
      layout = loaded.layout;
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Failed to load products.';
  }

  const viewer = await viewerPromise;
  if (!marker && viewer) {
    try {
      const loaded = await loadList(viewer.id);
      products = loaded.products;
      layout = loaded.layout;
    } catch (error) {
      loadError = error instanceof Error ? error.message : 'Failed to load products.';
    }
  }
  const listMs = performance.now() - listStarted;
  rememberServerTiming(
    requestId,
    serverTimingHeader({ auth: authMs, list: viewer ? listMs : 0, render: performance.now() - started - (viewer ? listMs : 0) })
  );
  if (!viewer) return <GuestLanding />;

  const grouped = new Map<string, ProductView[]>();
  for (const product of products) {
    const key = product.categoryName || 'Uncategorised';
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(product);
    } else {
      grouped.set(key, [product]);
    }
  }

  const groups = [...grouped.entries()].map(([category, items]) => ({
    category,
    products: sortProducts(items)
  }));

  return (
    <main>
      <DashboardHero products={products} accountHref={viewer.isDemo ? null : '/account'} />
      <ProductSearch
        isDemo={viewer.isDemo}
        trackedUrls={products.flatMap((product) => product.links.map((link) => link.url))}
      />

      {loadError ? (
        <div className="alert">
          Could not load products from Supabase: {loadError}
        </div>
      ) : null}

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
      ) : null}

      <CategoryList groups={groups} savedLayout={layout} readOnly={viewer.isDemo} />
    </main>
  );
}
