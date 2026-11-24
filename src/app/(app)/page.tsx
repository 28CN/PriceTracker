import { headers } from 'next/headers';

import DashboardWorkspace from '@/components/DashboardWorkspace';
import GuestLanding from '@/components/GuestLanding';
import { getViewer } from '@/lib/auth';
import { fetchCategoryLayout, type CategoryLayout } from '@/lib/categoryLayout';
import { groupProductsByCategory } from '@/lib/productSort';
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

  const groups = groupProductsByCategory(products);

  return (
    <DashboardWorkspace
      products={products}
      groups={groups}
      savedLayout={layout}
      isDemo={viewer.isDemo}
      accountHref={viewer.isDemo ? null : '/account'}
      loadError={loadError}
    />
  );
}
