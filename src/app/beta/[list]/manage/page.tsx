import { notFound } from 'next/navigation';

import AddProductForm from '@/components/AddProductForm';
import ManageProducts from '@/components/ManageProducts';
import { LIST_LABELS, parseListKind } from '@/lib/listKind';
import { fetchCategories, fetchProducts } from '@/lib/queries';
import type { CategoryView, ProductView } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function BetaManagePage({ params }: { params: { list: string } }) {
  const list = parseListKind(params.list);
  if (!list) {
    notFound();
  }

  let categories: CategoryView[] = [];
  let products: ProductView[] = [];
  let loadError: string | null = null;

  try {
    [categories, products] = await Promise.all([fetchCategories(), fetchProducts(list)]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Failed to load data.';
  }

  return (
    <main>
      {loadError ? (
        <div className="alert" style={{ marginTop: 12 }}>
          {loadError}
        </div>
      ) : null}

      <h2 className="section-title">Add a product · {LIST_LABELS[list]}</h2>
      <AddProductForm categories={categories} listKind={list} />

      <h2 className="section-title">Tracked products</h2>
      <ManageProducts products={products} />
    </main>
  );
}
