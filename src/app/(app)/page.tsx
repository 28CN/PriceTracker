import Link from 'next/link';

import CategoryList from '@/components/CategoryList';
import DashboardHero from '@/components/DashboardHero';
import GuestLanding from '@/components/GuestLanding';
import ProductSearch from '@/components/ProductSearch';
import { getViewer } from '@/lib/auth';
import { fetchCategoryLayout, type CategoryLayout } from '@/lib/categoryLayout';
import { sortProducts } from '@/lib/productSort';
import { fetchProducts } from '@/lib/queries';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ProductView } from '@/lib/types';

// Prices change behind the scenes, so never serve a cached snapshot. Marking the
// route dynamic is not enough on its own: Vercel's Data Cache would still answer
// the Supabase queries from an old snapshot, and it outlives redeploys.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function HomePage() {
  const viewer = await getViewer();
  if (!viewer) {
    const admin = createAdminSupabaseClient();
    const { data: adminRole } = await admin
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle();
    const featured = adminRole?.user_id
      ? await fetchProducts(admin, adminRole.user_id)
      : [];
    return <GuestLanding featured={featured} />;
  }

  let products: ProductView[] = [];
  let loadError: string | null = null;
  let layout: CategoryLayout | null = null;
  const supabase = await createServerSupabaseClient();

  try {
    [products, layout] = await Promise.all([
      fetchProducts(supabase, viewer.id),
      fetchCategoryLayout(supabase, viewer.id)
    ]);
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
      <DashboardHero products={products} accountHref="/account" />
      <ProductSearch trackedUrls={products.flatMap((product) => product.links.map((link) => link.url))} />

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

      <CategoryList groups={groups} savedLayout={layout} readOnly={viewer.isDemo} />
    </main>
  );
}
