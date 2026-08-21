import Link from 'next/link';

import CategorySection from '@/components/CategorySection';
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

  const categories = [...grouped.keys()].sort((a, b) => {
    if (a === 'Uncategorised') return 1;
    if (b === 'Uncategorised') return -1;
    return a.localeCompare(b);
  });

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

      <div className="category-stack">
        {categories.map((category) => (
          <CategorySection
            key={category}
            category={category}
            products={grouped.get(category) || []}
            defaultOpen={false}
          />
        ))}
      </div>
    </main>
  );
}
