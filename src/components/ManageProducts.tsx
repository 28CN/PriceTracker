'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import EditProductForm from '@/components/EditProductForm';
import RetailerLogo from '@/components/RetailerLogo';
import { formatMoney } from '@/lib/format';
import type { ProductView } from '@/lib/types';

export default function ManageProducts({ products }: { products: ProductView[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);

  if (products.length === 0) {
    return (
      <div className="card empty">
        <p className="hint">No products yet.</p>
      </div>
    );
  }

  return (
    <div className="stack">
      {products.map((product) => (
        <article className="card tight" key={product.id}>
          <div className="card-head-row">
            <div className="row" style={{ flex: 1, minWidth: 0 }}>
              <div className="row-main">
                <h3 className="product-name">{product.name}</h3>
                {product.categoryName ? <span className="chip">{product.categoryName}</span> : null}
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
                setEditingId((current) => (current === product.id ? null : product.id))
              }
            >
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
                <div className={`row ${link.isActive ? '' : 'inactive'}`} key={link.id}>
                  <div className="row-main">
                    <div className="row-shop">
                      <RetailerLogo retailer={link.retailer} url={link.url} />
                      <span>{link.retailer}</span>
                    </div>
                    <div className="row-meta">
                      {link.latestPrice === null ? 'No price yet' : formatMoney(link.latestPrice)}
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
  );
}
