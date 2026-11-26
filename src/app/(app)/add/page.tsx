import { PackagePlus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import AddProductForm from '@/components/AddProductForm';
import AddTools from '@/components/AddTools';
import { requireViewer } from '@/lib/auth';
import { cleanHttpUrl } from '@/lib/productUrl';
import { fetchCategories, fetchProducts } from '@/lib/queries';
import { addPathFor, parseSharedLink } from '@/lib/sharedLink';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { CategoryView, ProductView } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export const metadata: Metadata = {
  title: 'Add a product · PriceTracker',
  robots: { index: false, follow: false }
};

type AddSearchParams = { url?: string | string[]; title?: string | string[]; text?: string | string[] };

// Opened from a bookmarklet, the Android share sheet or an iOS Shortcut:
// /add?url=…&title=…&text=…
export default async function AddPage({ searchParams }: { searchParams: Promise<AddSearchParams> }) {
  const params = await searchParams;
  const viewer = await requireViewer(addPathFor(params));
  const shared = parseSharedLink(params);
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

  const existing =
    shared.status === 'ok'
      ? products.find((product) => product.links.some((link) => cleanHttpUrl(link.url) === shared.url))
      : undefined;

  return (
    <main>
      <header className="add-page-head">
        <span className="page-head-icon" aria-hidden="true">
          <PackagePlus size={20} strokeWidth={1.9} />
        </span>
        <h1>Add a product</h1>
      </header>

      {loadError ? <div className="alert add-notice">{loadError}</div> : null}

      {shared.status === 'invalid' ? (
        <div className="alert add-notice" role="alert">
          That link did not work. Copy the link from the shop page and try again.
        </div>
      ) : null}

      {shared.status === 'listing' ? (
        <div className="alert add-notice" role="alert">
          This page shows many products. Open one product, then add that page.{' '}
          <a href={shared.url} target="_blank" rel="noopener noreferrer">
            Open the shop page
          </a>
        </div>
      ) : null}

      {existing ? (
        <div className="card add-notice add-existing" role="status">
          <strong>{existing.name}</strong> is already on your list.{' '}
          <Link href={`/#p-${existing.id}`}>Show it</Link>
        </div>
      ) : (
        <AddProductForm
          categories={categories}
          initialUrl={shared.status === 'ok' ? shared.url : undefined}
          initialName={shared.status === 'ok' ? shared.name : ''}
          readOnly={viewer.isDemo}
          savedHref="/"
        />
      )}

      <AddTools />
    </main>
  );
}
