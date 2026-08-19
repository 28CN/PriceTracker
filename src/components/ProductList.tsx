'use client';

import { useState } from 'react';

import { formatCheckedAt, formatMoney, latestTimestamp } from '@/lib/format';
import type { ProductView } from '@/lib/types';

function ProductCard({ product }: { product: ProductView }) {
  const [isOpen, setIsOpen] = useState(false);
  const hitsTarget =
    product.targetPrice !== null &&
    product.lowestPrice !== null &&
    product.lowestPrice <= product.targetPrice;
  const checkedAt = latestTimestamp(product.links.map((link) => link.latestAt));

  return (
    <article className="card">
      <button
        type="button"
        className="card-head"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
      >
        <div className="row-main">
          <h2 className="product-name">{product.name}</h2>
          {product.categoryName ? <span className="chip">{product.categoryName}</span> : null}
          {hitsTarget ? <span className="hit">Under target</span> : null}
        </div>
        <div className="price-block">
          {product.lowestPrice === null ? (
            <span className="price muted">No price yet</span>
          ) : (
            <span className="price">{formatMoney(product.lowestPrice)}</span>
          )}
          <span className="price-note">
            {product.lowestRetailer
              ? `at ${product.lowestRetailer}`
              : `${product.links.length} link${product.links.length === 1 ? '' : 's'}`}
          </span>
          <span className="price-note">Checked {formatCheckedAt(checkedAt)}</span>
          <span className="price-note">{isOpen ? 'Tap to hide' : 'Tap for all shops'}</span>
        </div>
      </button>

      {isOpen ? (
        <div className="rows">
          {product.links.length === 0 ? (
            <p className="hint">No links yet. Add some from the Manage page.</p>
          ) : null}

          {product.links.map((link) => (
            <div key={link.id} className={`row ${link.isActive ? '' : 'inactive'}`}>
              <div className="row-main">
                <div className="row-shop">{link.retailer}</div>
                <div className="row-meta">
                  {link.isActive ? formatCheckedAt(link.latestAt) : 'paused'}
                </div>
              </div>
              <div className="row-side">
                <span
                  className={`row-price ${
                    link.latestPrice === null
                      ? 'none'
                      : link.latestPrice === product.lowestPrice
                        ? 'best'
                        : ''
                  }`}
                >
                  {link.latestPrice === null ? '--' : formatMoney(link.latestPrice)}
                </span>
                {link.url ? (
                  <a className="open-link" href={link.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                ) : null}
              </div>
            </div>
          ))}

          {product.targetPrice !== null ? (
            <p className="hint">Target price {formatMoney(product.targetPrice)}</p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default function ProductList({ products }: { products: ProductView[] }) {
  if (products.length === 0) {
    return (
      <div className="card empty">
        <p className="hint">Nothing tracked yet. Head to Manage to add your first product.</p>
      </div>
    );
  }

  return (
    <div className="stack">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
