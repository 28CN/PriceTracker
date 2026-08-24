'use client';

import { useState } from 'react';

import EditProductForm from '@/components/EditProductForm';
import RetailerLogo from '@/components/RetailerLogo';
import { formatCheckedAt, formatMoney, latestTimestamp } from '@/lib/format';
import { isKnownRetailer } from '@/lib/retailer';
import type { ProductView } from '@/lib/types';

function ProductCard({ product }: { product: ProductView }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const hitsTarget =
    product.targetPrice !== null &&
    product.lowestPrice !== null &&
    product.lowestPrice <= product.targetPrice;
  const checkedAt = latestTimestamp(product.links.map((link) => link.latestAt));
  const bestLink = product.links.find(
    (link) =>
      link.retailer === product.lowestRetailer ||
      (link.latestPrice !== null && link.latestPrice === product.lowestPrice)
  );

  function openEditor(event: React.MouseEvent) {
    event.stopPropagation();
    setIsEditing(true);
    setIsOpen(true);
  }

  return (
    <article className={`card ${isEditing ? 'is-editing' : ''}`}>
      <div className="card-head-row">
        <button
          type="button"
          className="card-head"
          onClick={() => {
            if (isEditing) {
              return;
            }
            setIsOpen((current) => !current);
          }}
          aria-expanded={isOpen}
        >
          <div className="row-main">
            <h2 className="product-name">{product.name}</h2>
            {hitsTarget ? <span className="hit">Under target</span> : null}
            {product.targetPrice !== null ? (
              <span className="price-note">Target {formatMoney(product.targetPrice)}</span>
            ) : null}
          </div>
          <div className="price-block">
            {product.lowestPrice === null ? (
              <span className="price muted">No price yet</span>
            ) : (
              <span className="price">{formatMoney(product.lowestPrice)}</span>
            )}
            <span className="price-note price-note-shop">
              {product.lowestRetailer ? (
                <>
                  <RetailerLogo retailer={product.lowestRetailer} url={bestLink?.url} />
                  <span>at {product.lowestRetailer}</span>
                </>
              ) : (
                `${product.links.length} link${product.links.length === 1 ? '' : 's'}`
              )}
            </span>
            <span className="price-note">Checked {formatCheckedAt(checkedAt)}</span>
          </div>
        </button>
        <button type="button" className="card-edit-btn" onClick={openEditor}>
          Edit
        </button>
      </div>

      {isEditing ? (
        <EditProductForm product={product} onClose={() => setIsEditing(false)} />
      ) : null}

      {!isEditing && isOpen ? (
        <div className="rows">
          {product.links.length === 0 ? (
            <p className="hint">No links yet. Use Edit to add shop URLs.</p>
          ) : null}

          {product.links.map((link) => (
            <div key={link.id} className={`row ${link.isActive ? '' : 'inactive'}`}>
              <div className="row-main">
                <div className="row-shop">
                  <RetailerLogo retailer={link.retailer} url={link.url} />
                  <span>{link.retailer}</span>
                  {!isKnownRetailer(link.url || link.retailer) ? (
                    <span className="pending-support" title="Generic crawler will try; a dedicated parser can be added next update">
                      pending support
                    </span>
                  ) : null}
                </div>
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
