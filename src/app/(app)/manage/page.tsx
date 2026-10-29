import { LayoutDashboard } from 'lucide-react';

import ManageWorkspace from '@/components/ManageWorkspace';
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
          <span className="eyebrow">
            <LayoutDashboard size={14} /> Watchlist tools
          </span>
          <h1>Add and edit tracked products.</h1>
          <p>Search a shop, paste links, or fix products that need attention.</p>
        </div>
      </section>

      {loadError ? (
        <div className="alert" style={{ marginTop: 12 }}>
          {loadError}
        </div>
      ) : null}

      <ManageWorkspace categories={categories} products={products} />
    </main>
  );
}
