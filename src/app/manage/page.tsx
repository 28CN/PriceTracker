import AddProductForm from '@/components/AddProductForm';
import ManageProducts from '@/components/ManageProducts';
import { fetchCategories, fetchProducts } from '@/lib/queries';
import type { CategoryView, ProductView } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function ManagePage() {
  let categories: CategoryView[] = [];
  let products: ProductView[] = [];
  let loadError: string | null = null;

  try {
    [categories, products] = await Promise.all([fetchCategories(), fetchProducts()]);
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

      <h2 className="section-title">Add a product</h2>
      <AddProductForm categories={categories} />

      <h2 className="section-title">Tracked products</h2>
      <ManageProducts products={products} />
    </main>
  );
}
