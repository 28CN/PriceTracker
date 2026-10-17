import { LayoutDashboard, PackagePlus } from 'lucide-react';

import AddProductForm from '@/components/AddProductForm';
import CategoryPrivacyControls from '@/components/CategoryPrivacyControls';
import ManageProducts from '@/components/ManageProducts';
import ProductSearch from '@/components/ProductSearch';
import { requireViewer } from '@/lib/auth';
import { fetchCategories, fetchProducts } from '@/lib/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { CategoryView, ProductView } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function ManagePage() {
  const viewer = await requireViewer('/manage');
  const supabase = await createServerSupabaseClient();
  let categories: CategoryView[] = [];
  let products: ProductView[] = [];
  let loadError: string | null = null;

  try {
    [categories, products] = await Promise.all([
      fetchCategories(supabase, viewer.id),
      fetchProducts(supabase, viewer.id)
    ]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Failed to load data.';
  }

  return (
    <main>
      <section className="manage-hero">
        <div>
          <span className="eyebrow"><LayoutDashboard size={14} /> Collection workspace</span>
          <h1>Shape your price watchlist.</h1>
          <p>Add products, choose targets and keep every retailer link organised.</p>
        </div>
        <svg viewBox="0 0 240 120" aria-hidden="true">
          <rect x="34" y="22" width="166" height="78" rx="22" fill="var(--brand-soft)" stroke="var(--line)" />
          <path d="M72 48h92M72 64h68M72 80h82" stroke="var(--brand)" strokeWidth="7" strokeLinecap="round" opacity=".3" />
          <circle cx="48" cy="32" r="16" fill="var(--surface-strong)" stroke="var(--line)" />
          <path d="M48 25v14M41 32h14" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </section>

      {loadError ? (
        <div className="alert" style={{ marginTop: 12 }}>
          {loadError}
        </div>
      ) : null}

      <ProductSearch trackedUrls={products.flatMap((product) => product.links.map((link) => link.url))} />

      <h2 className="section-title"><PackagePlus size={15} /> Add a product</h2>
      <AddProductForm categories={categories} />

      <CategoryPrivacyControls categories={categories} />

      <h2 className="section-title"><LayoutDashboard size={15} /> Tracked products</h2>
      <ManageProducts products={products} />
    </main>
  );
}
