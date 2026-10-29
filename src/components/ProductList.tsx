'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, ChevronDown, ExternalLink, Pencil, Target } from 'lucide-react';
import { useState } from 'react';

import EditProductForm from '@/components/EditProductForm';
import ExpiredPrice from '@/components/ExpiredPrice';
import PriceChart from '@/components/PriceChart';
import ProductVisual from '@/components/ProductVisual';
import RetailerLogo from '@/components/RetailerLogo';
import { formatCheckedAt, formatMoney, latestTimestamp } from '@/lib/format';
import { cheapestStaleLink } from '@/lib/priceAge';
import { productThumb } from '@/lib/productImage';
import { hasCrawlerSupport } from '@/lib/retailer';
import type { ProductView } from '@/lib/types';

function ProductCard({ product, readOnly }: { product: ProductView; readOnly: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const activeLinks = product.links.filter((link) => link.isActive);
  const allUnavailable =
    activeLinks.length > 0 && activeLinks.every((link) => link.stockStatus === 'unavailable');
  const hitsTarget =
    product.targetPrice !== null &&
    product.lowestPrice !== null &&
    product.lowestPrice <= product.targetPrice;
  const bestLink = product.links.find(
    (link) =>
      link.isActive &&
      !link.priceStale &&
      link.latestPrice !== null &&
      (link.retailer === product.lowestRetailer || link.latestPrice === product.lowestPrice)
  );
  const staleLink = cheapestStaleLink(product.links);
  const headlineStale = !allUnavailable && !bestLink && staleLink !== null;
  const headlineLink = allUnavailable
    ? activeLinks.length === 1
      ? activeLinks[0]
      : null
    : bestLink ?? staleLink;
  // Date belongs to the price on screen, not the most recently crawled shop.
  const checkedAt = allUnavailable
    ? latestTimestamp(activeLinks.map((link) => link.latestAt))
    : headlineLink?.latestAt ?? null;

  const shopRetailer = allUnavailable
    ? activeLinks.length === 1
      ? activeLinks[0].retailer
      : null
    : headlineLink?.retailer ?? null;
  const shopUrl = allUnavailable
    ? activeLinks.length === 1
      ? activeLinks[0].url
      : undefined
    : headlineLink?.url;
  const thumb = productThumb(product, headlineLink?.id);

  const shopLabel = allUnavailable
    ? activeLinks.length === 1
      ? activeLinks[0].retailer
      : `${activeLinks.length} shops`
    : headlineLink?.retailer
      ? headlineLink.retailer
      : `${product.links.length} link${product.links.length === 1 ? '' : 's'}`;

  function openEditor(event: React.MouseEvent) {
    event.stopPropagation();
    setIsEditing(true);
    setIsOpen(true);
  }

  return (
    <motion.article
      className={`card product-card ${isEditing ? 'is-editing' : ''}`}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-24px' }}
      whileHover={isEditing ? undefined : { y: -3, scale: 1.004 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="card-head-row">
        <button
          type="button"
          className="card-head"
          onClick={(event) => {
            if (isEditing) {
              return;
            }
            if ((event.target as HTMLElement).closest('[data-reveal-price]')) {
              return;
            }
            setIsOpen((current) => !current);
          }}
          aria-expanded={isOpen}
        >
          <div className="card-title-row">
            <ProductVisual
              key={thumb?.proxied || product.id}
              source={thumb}
              name={product.name}
              category={product.categoryName}
            />
            <div className="product-title-copy">
              <h2 className="product-name">{product.name}</h2>
              {product.categoryName ? <span className="chip">{product.categoryName}</span> : null}
            </div>
            <ChevronDown
              className={`card-chevron${isOpen ? ' is-open' : ''}`}
              size={17}
              aria-hidden="true"
            />
          </div>

          <div className="card-meta-row">
            <div className="card-meta-left">
              {hitsTarget ? (
                <span className="hit"><CheckCircle2 size={13} /> Under target</span>
              ) : null}
              {product.targetPrice !== null ? (
                <span className="price-note"><Target size={13} /> Target {formatMoney(product.targetPrice)}</span>
              ) : (
                <span className="price-note muted-empty">No target</span>
              )}
            </div>

            <div className="price-block">
              {allUnavailable ? (
                <span className="price muted">Unavailable</span>
              ) : headlineStale && staleLink && staleLink.latestPrice !== null ? (
                <ExpiredPrice price={staleLink.latestPrice} revealedClassName="price" nested />
              ) : product.lowestPrice === null ? (
                <span className="price muted">No price yet</span>
              ) : (
                <span className="price">{formatMoney(product.lowestPrice)}</span>
              )}
              <span className="price-note price-note-shop">
                {shopRetailer ? (
                  <>
                    <span className="shop-at">at</span>
                    <RetailerLogo retailer={shopRetailer} url={shopUrl} />
                    <span className="shop-name">{shopLabel}</span>
                  </>
                ) : (
                  <span className="shop-name">{shopLabel}</span>
                )}
              </span>
              <span className="price-note">Checked {formatCheckedAt(checkedAt)}</span>
            </div>
          </div>
        </button>
        {!readOnly ? (
          <button type="button" className="card-edit-btn" onClick={openEditor}>
            <Pencil size={13} aria-hidden="true" />
            Edit
          </button>
        ) : null}
      </div>

      {isEditing ? (
        <EditProductForm product={product} onClose={() => setIsEditing(false)} />
      ) : null}

      <AnimatePresence initial={false}>
      {!isEditing && isOpen ? (
        <motion.div
          className="rows"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.22 }}
        >
          {product.links.length === 0 ? (
            <p className="hint">
              {readOnly ? 'No shop links are available.' : 'No links yet. Use Edit to add shop URLs.'}
            </p>
          ) : null}

          {product.links.length > 0 ? <PriceChart productId={product.id} /> : null}

          {product.links.map((link) => (
            <div key={link.id} className={`row ${link.isActive ? '' : 'inactive'}`}>
              <div className="row-main">
                <div className="row-shop">
                  <RetailerLogo retailer={link.retailer} url={link.url} />
                  <span>{link.retailer}</span>
                  {!hasCrawlerSupport(link.url || link.retailer) ? (
                    <span
                      className="pending-support"
                      title="No crawler for this shop yet"
                    >
                      ?
                    </span>
                  ) : null}
                </div>
                <div className="row-meta">
                  {link.isActive ? formatCheckedAt(link.latestAt) : 'paused'}
                </div>
              </div>
              <div className="row-side">
                {link.priceStale && link.latestPrice !== null ? (
                  <ExpiredPrice price={link.latestPrice} revealedClassName="row-price" />
                ) : (
                  <span
                    className={`row-price ${
                      link.stockStatus === 'unavailable'
                        ? 'unavailable'
                        : link.latestPrice === null
                          ? 'none'
                          : link.latestPrice === product.lowestPrice
                            ? 'best'
                            : ''
                    }`}
                  >
                    {link.stockStatus === 'unavailable'
                      ? 'Unavailable'
                      : link.latestPrice === null
                        ? '--'
                        : formatMoney(link.latestPrice)}
                  </span>
                )}
                {link.url ? (
                  <a className="open-link" href={link.url} target="_blank" rel="noreferrer">
                    Open <ExternalLink size={13} aria-hidden="true" />
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </motion.div>
      ) : null}
      </AnimatePresence>
    </motion.article>
  );
}

export default function ProductList({
  products,
  readOnly = false
}: {
  products: ProductView[];
  readOnly?: boolean;
}) {
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
        <ProductCard key={product.id} product={product} readOnly={readOnly} />
      ))}
    </div>
  );
}
