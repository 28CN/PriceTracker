import Link from 'next/link';

import CategoryList from '@/components/CategoryList';
import DashboardHero from '@/components/DashboardHero';
import { getViewer } from '@/lib/auth';
import { fetchCategoryLayout, type CategoryLayout } from '@/lib/categoryLayout';
import { sortProducts } from '@/lib/productSort';
import { fetchProducts } from '@/lib/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ProductView } from '@/lib/types';

// Prices change behind the scenes, so never serve a cached snapshot. Marking the
// route dynamic is not enough on its own: Vercel's Data Cache would still answer
// the Supabase queries from an old snapshot, and it outlives redeploys.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function HomePage() {
  let products: ProductView[] = [];
  let loadError: string | null = null;
  let layout: CategoryLayout | null = null;
  const supabase = await createServerSupabaseClient();
  const viewer = await getViewer();

  try {
    let ownerId = viewer?.id;
    if (!ownerId) {
      const { data: publicProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', 'melody2251')
        .eq('watchlist_visibility', 'public')
        .maybeSingle();
      ownerId = publicProfile?.id;
    }

    if (ownerId) {
      [products, layout] = await Promise.all([
        fetchProducts(supabase, ownerId),
        viewer ? fetchCategoryLayout(supabase, ownerId) : Promise.resolve(null)
      ]);
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Failed to load products.';
  }

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
      <DashboardHero products={products} accountHref={viewer ? '/account' : '/login'} />

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
          <h2>Your watchlist is ready</h2>
          <p className="hint">
            Nothing tracked yet. Use <Link href="/manage">Manage</Link> to add a product and its shop
            links.
          </p>
        </div>
      ) : null}

      <CategoryList groups={groups} savedLayout={layout} />
    </main>
  );
}
