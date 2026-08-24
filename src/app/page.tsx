import Link from 'next/link';

import CategoryList from '@/components/CategoryList';
import { sortProducts } from '@/lib/productSort';
import { fetchProducts } from '@/lib/queries';
import type { ProductView } from '@/lib/types';

// Prices change behind the scenes, so never serve a cached snapshot. Marking the
// route dynamic is not enough on its own: Vercel's Data Cache would still answer
// the Supabase queries from an old snapshot, and it outlives redeploys.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function HomePage() {
  let products: ProductView[] = [];
  let loadError: string | null = null;

  try {
    products = await fetchProducts();
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
      {loadError ? (
        <div className="alert" style={{ marginTop: 12 }}>
          Could not load products from Supabase: {loadError}
        </div>
      ) : null}

      {!loadError && products.length === 0 ? (
        <div className="card empty" style={{ marginTop: 12 }}>
          <p className="hint">
            Nothing tracked yet. Use <Link href="/manage">Manage</Link> to add a product and its shop
            links.
          </p>
        </div>
      ) : null}

      <CategoryList groups={groups} />
    </main>
  );
}
