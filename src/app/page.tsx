import Link from 'next/link';

import ProductList from '@/components/ProductList';
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

      {categories.map((category) => (
        <section key={category}>
          <h2 className="section-title">{category}</h2>
          <ProductList products={grouped.get(category) || []} />
        </section>
      ))}
    </main>
  );
}
