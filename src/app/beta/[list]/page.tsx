import Link from 'next/link';
import { notFound } from 'next/navigation';

import CategoryList from '@/components/CategoryList';
import { LIST_LABELS, parseListKind } from '@/lib/listKind';
import { sortProducts } from '@/lib/productSort';
import { fetchProducts } from '@/lib/queries';
import type { ProductView } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function BetaListPage({ params }: { params: { list: string } }) {
  const list = parseListKind(params.list);
  if (!list) {
    notFound();
  }

  let products: ProductView[] = [];
  let loadError: string | null = null;

  try {
    products = await fetchProducts(list);
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
            Nothing on {LIST_LABELS[list]} yet. Use{' '}
            <Link href={`/beta/${list}/search`}>Search</Link> or{' '}
            <Link href={`/beta/${list}/manage`}>Manage</Link> to add products.
          </p>
        </div>
      ) : null}

      <CategoryList groups={groups} />
    </main>
  );
}
