'use client';

import { Link2, LayoutDashboard, PackagePlus, Search } from 'lucide-react';
import { useState } from 'react';

import AddProductForm from '@/components/AddProductForm';
import ManageProducts from '@/components/ManageProducts';
import ProductSearch from '@/components/ProductSearch';
import type { CategoryView, ProductView } from '@/lib/types';

type Tab = 'products' | 'add';

export default function ManageWorkspace({
  categories,
  products
}: {
  categories: CategoryView[];
  products: ProductView[];
}) {
  const [tab, setTab] = useState<Tab>('products');
  const [addMode, setAddMode] = useState<'search' | 'paste'>('search');
  const trackedUrls = products.flatMap((product) => product.links.map((link) => link.url));

  return (
    <div className="manage-workspace">
      <div className="manage-tabs" role="tablist" aria-label="Manage watchlist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'products'}
          className={tab === 'products' ? 'is-active' : undefined}
          onClick={() => setTab('products')}
        >
          <LayoutDashboard size={15} aria-hidden="true" />
          Products
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'add'}
          className={tab === 'add' ? 'is-active' : undefined}
          onClick={() => setTab('add')}
        >
          <PackagePlus size={15} aria-hidden="true" />
          Add
        </button>
      </div>

      {tab === 'products' ? (
        <section aria-label="Tracked products">
          <ManageProducts products={products} />
        </section>
      ) : (
        <section className="manage-add-panel" aria-label="Add products">
          <div className="add-mode-tabs" role="tablist" aria-label="How to add">
            <button
              type="button"
              role="tab"
              aria-selected={addMode === 'search'}
              className={addMode === 'search' ? 'is-active' : undefined}
              onClick={() => setAddMode('search')}
            >
              <Search size={15} aria-hidden="true" />
              Search
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={addMode === 'paste'}
              className={addMode === 'paste' ? 'is-active' : undefined}
              onClick={() => setAddMode('paste')}
            >
              <Link2 size={15} aria-hidden="true" />
              Paste link
            </button>
          </div>
          {addMode === 'search' ? (
            <ProductSearch trackedUrls={trackedUrls} />
          ) : (
            <AddProductForm categories={categories} />
          )}
        </section>
      )}
    </div>
  );
}
