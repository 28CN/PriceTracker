'use client';

import { ChevronDown, Pencil, TriangleAlert, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import EditProductForm from '@/components/EditProductForm';
import RetailerLogo from '@/components/RetailerLogo';
import { formatMoney } from '@/lib/format';
import { hasCrawlerSupport } from '@/lib/retailer';
import type { LinkView, ProductView } from '@/lib/types';

function linkNeedsAttention(link: LinkView): boolean {
  if (!link.isActive) return false;
  if (link.stockStatus === 'unavailable') return true;
  if (!hasCrawlerSupport(link.url || link.retailer)) return true;
  return link.latestPrice === null;
}

function productNeedsAttention(product: ProductView): boolean {
  return product.links.some(linkNeedsAttention);
}

function groupByCategory(products: ProductView[]) {
  const groups = new Map<string, ProductView[]>();
  for (const product of products) {
    const key = product.categoryName || 'Uncategorised';
    const bucket = groups.get(key);
    if (bucket) bucket.push(product);
    else groups.set(key, [product]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export default function ManageProducts({ products }: { products: ProductView[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'issues'>('all');
  const issueCount = useMemo(
    () => products.filter(productNeedsAttention).length,
    [products]
  );

  const visible = useMemo(
    () => (filter === 'issues' ? products.filter(productNeedsAttention) : products),
    [filter, products]
  );
  const groups = useMemo(() => groupByCategory(visible), [visible]);

  if (products.length === 0) {
    return (
      <div className="card empty">
        <p className="hint">No products yet.</p>
      </div>
    );
  }

  return (
    <div className="manage-products">
      <div className="manage-filter-row">
        <button
          type="button"
          className={`chip-button${filter === 'all' ? ' is-active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({products.length})
        </button>
        <button
          type="button"
          className={`chip-button${filter === 'issues' ? ' is-active' : ''}`}
          onClick={() => setFilter('issues')}
        >
          <TriangleAlert size={14} aria-hidden="true" />
          Needs attention ({issueCount})
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="card empty">
          <p className="hint">No products need attention right now.</p>
        </div>
      ) : (
        <div className="manage-category-stack">
          {groups.map(([category, items]) => (
            <details
              key={category}
              className="manage-category"
              open={filter === 'issues' || groups.length === 1}
            >
              <summary>
                <ChevronDown size={16} aria-hidden="true" />
                <span>{category}</span>
                <span className="manage-category-count">
                  {items.length} product{items.length === 1 ? '' : 's'}
                </span>
              </summary>
              <div className="stack">
                {items.map((product) => (
                  <article className="card tight" key={product.id}>
                    <div className="card-head-row">
                      <div className="row" style={{ flex: 1, minWidth: 0 }}>
                        <div className="row-main">
                          <h3 className="product-name">{product.name}</h3>
                          {productNeedsAttention(product) ? (
                            <span className="chip warn">Needs attention</span>
                          ) : null}
                        </div>
                        <div className="price-block">
                          <span className="price-note">
                            {product.targetPrice === null
                              ? 'No target'
                              : `Target ${formatMoney(product.targetPrice)}`}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="card-edit-btn"
                        onClick={() =>
                          setEditingId((current) =>
                            current === product.id ? null : product.id
                          )
                        }
                      >
                        {editingId === product.id ? <X size={13} /> : <Pencil size={13} />}
                        {editingId === product.id ? 'Close' : 'Edit'}
                      </button>
                    </div>

                    {editingId === product.id ? (
                      <EditProductForm
                        product={product}
                        onClose={() => {
                          setEditingId(null);
                          router.refresh();
                        }}
                      />
                    ) : (
                      <div className="rows">
                        {product.links.map((link) => (
                          <div
                            className={`row ${link.isActive ? '' : 'inactive'}`}
                            key={link.id}
                          >
                            <div className="row-main">
                              <div className="row-shop">
                                <RetailerLogo retailer={link.retailer} url={link.url} />
                                <span>{link.retailer}</span>
                              </div>
                              <div className="row-meta">
                                {link.stockStatus === 'unavailable'
                                  ? 'Unavailable'
                                  : link.latestPrice === null
                                    ? 'No price yet'
                                    : formatMoney(link.latestPrice)}
                                {link.isActive ? '' : ' - paused'}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
