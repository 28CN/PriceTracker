'use client';

import { ChevronDown, ExternalLink, Pencil } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';

import EditProductForm from '@/components/EditProductForm';
import ProductVisual from '@/components/ProductVisual';
import RetailerLogo from '@/components/RetailerLogo';
import { resolveCardPrice, shopGapLabel } from '@/lib/cardState';
import { formatCheckedAt, formatLastSeen, formatMoney, latestTimestamp } from '@/lib/format';
import { productThumb } from '@/lib/productImage';
import { hasCrawlerSupport } from '@/lib/retailer';
import type { ProductView } from '@/lib/types';

const PriceChart = dynamic(() => import('@/components/PriceChart'), {
  loading: () => (
    <div className="price-chart is-loading" aria-busy="true" aria-label="Loading price history">
      <div className="pc-plot">
        <div className="pc-canvas pc-skel" />
      </div>
    </div>
  )
});

function CheckedOn({ iso }: { iso: string }) {
  const label = formatCheckedAt(iso);
  if (!label) return null;
  return (
    <span className="rail-when">
      Checked <time dateTime={iso}>{label}</time>
    </span>
  );
}

function LastSeen({ iso }: { iso: string | null | undefined }) {
  const label = formatLastSeen(iso);
  if (!label || !iso) return null;
  return (
    <span className="price-last-seen">
      Last seen <time dateTime={iso}>{label}</time>
    </span>
  );
}

function ProductCard({ product, readOnly }: { product: ProductView; readOnly: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const activeLinks = product.links.filter((link) => link.isActive);
  const cardPrice = resolveCardPrice({
    links: product.links,
    checkState: product.checkState
  });
  const { headline, allUnavailable, cheapestFreshLink, freshOffers } = cardPrice;
  const lowestFreshPrice = cheapestFreshLink?.latestPrice ?? null;
  const hitsTarget =
    product.targetPrice !== null &&
    lowestFreshPrice !== null &&
    lowestFreshPrice <= product.targetPrice;
  const shopGap = shopGapLabel(freshOffers, formatMoney);
  const saving = shopGap !== null;
  const headlineLink = allUnavailable
    ? activeLinks.length === 1
      ? activeLinks[0]
      : null
    : cardPrice.headlineLink;
  const checkedAt = allUnavailable
    ? latestTimestamp(activeLinks.map((link) => link.latestAt))
    : headlineLink?.latestAt ?? null;
  const shopSource = headlineLink ?? (activeLinks.length === 1 ? activeLinks[0] : null);
  const shopRetailer = shopSource?.retailer ?? null;
  const shopUrl = shopSource?.url;
  const thumb = productThumb(product, shopSource?.id);
  const shopLabel = shopRetailer
    ? shopRetailer
    : product.links.length > 0
      ? product.links.map((link) => link.retailer).join(', ')
      : '';
  const shopUnsupported = Boolean(shopSource && !hasCrawlerSupport(shopSource.url || shopSource.retailer));
  const showChecked = Boolean(checkedAt) && (headline.kind === 'price' || headline.kind === 'unavailable');

  return (
    <article id={`p-${product.id}`} tabIndex={-1} className={`card product-card ${isEditing ? 'is-editing' : ''}`}>
      <div className="card-layout">
        <div className="card-main">
          <button
            type="button"
            className="card-open"
            aria-expanded={isOpen}
            onClick={() => {
              if (!isEditing) setIsOpen((current) => !current);
            }}
          >
            <ProductVisual
              key={thumb?.proxied || product.id}
              source={thumb}
              name={product.name}
              category={product.categoryName}
            />
            <span className="product-title-copy">
              <h2 className="product-name">{product.name}</h2>
              {product.categoryName ? <span className="chip">{product.categoryName}</span> : null}
              {product.targetPrice !== null ? (
                <span className="goal-line">
                  {hitsTarget ? 'Below goal' : 'Goal'} {formatMoney(product.targetPrice)}
                </span>
              ) : null}
            </span>
            <ChevronDown className={`card-chevron${isOpen ? ' is-open' : ''}`} size={17} aria-hidden="true" />
          </button>
          {!readOnly ? (
            <button
              type="button"
              className="card-edit-btn"
              onClick={() => {
                setIsEditing(true);
                setIsOpen(true);
              }}
            >
              <Pencil size={13} aria-hidden="true" />
              Edit
            </button>
          ) : null}
        </div>

        <div className="price-rail">
          {headline.kind === 'price' ? <span className="price">{formatMoney(headline.price)}</span> : null}
          {headline.kind === 'stale' ? (
            <span className="price is-stale">{formatMoney(headline.price)}</span>
          ) : null}
          {headline.kind === 'unavailable' ? <span className="price-state">Unavailable</span> : null}
          {headline.kind === 'checking' ? <span className="price-state">Checking…</span> : null}
          {headline.kind === 'queued' ? <span className="price-state">Checking soon</span> : null}
          {headline.kind === 'none' ? <span className="price-state">No price yet</span> : null}
          {shopLabel ? (
            <span className="rail-shop">
              {shopRetailer ? <RetailerLogo retailer={shopRetailer} url={shopUrl} /> : null}
              <span className="rail-shop-name">{shopLabel}</span>
            </span>
          ) : null}
          {shopUnsupported ? <span className="shop-gap">Not checked here</span> : null}
          {shopGap ? <span className="rail-when">{shopGap}</span> : null}
          {headline.kind === 'stale' ? <LastSeen iso={headline.lastSeenAt} /> : null}
          {showChecked && checkedAt ? <CheckedOn iso={checkedAt} /> : null}
        </div>
      </div>

      {isEditing ? <EditProductForm product={product} onClose={() => setIsEditing(false)} /> : null}

      {!isEditing && isOpen ? (
        <div className="rows">
          {product.links.length === 0 ? (
            <p className="hint">{readOnly ? 'No shop links are available.' : 'No shop links yet.'}</p>
          ) : (
            <PriceChart productId={product.id} />
          )}

          {product.links.map((link) => {
            const isStalePrice =
              link.priceStale && link.stockStatus !== 'unavailable' && link.latestPrice !== null;
            const isCheapestFresh =
              link.isActive &&
              !link.priceStale &&
              link.stockStatus !== 'unavailable' &&
              lowestFreshPrice !== null &&
              link.latestPrice === lowestFreshPrice;
            const showCheapestTag = saving && isCheapestFresh;

            return (
              <div
                key={link.id}
                className={`row ${link.isActive ? '' : 'inactive'}${showCheapestTag ? ' is-best' : ''}`}
              >
                <div className="row-main">
                  <div className="row-shop">
                    <RetailerLogo retailer={link.retailer} url={link.url} />
                    <span>{link.retailer}</span>
                    {showCheapestTag ? <span className="best-tag">Cheapest</span> : null}
                    {!hasCrawlerSupport(link.url || link.retailer) ? (
                      <span className="shop-gap">Not checked here</span>
                    ) : null}
                  </div>
                  {!link.isActive ? (
                    <div className="row-meta">Paused</div>
                  ) : isStalePrice ? null : (
                    <div className="row-meta">
                      {link.latestAt && formatCheckedAt(link.latestAt) ? (
                        <CheckedOn iso={link.latestAt} />
                      ) : (
                        'Not checked yet'
                      )}
                    </div>
                  )}
                </div>
                <div className="row-side">
                  {isStalePrice ? (
                    <span className="row-price-stale">
                      <span className="row-price is-stale">{formatMoney(link.latestPrice)}</span>
                      <LastSeen iso={link.latestAt} />
                    </span>
                  ) : (
                    <span
                      className={`row-price ${
                        link.stockStatus === 'unavailable'
                          ? 'unavailable'
                          : link.latestPrice === null
                            ? 'none'
                            : isCheapestFresh
                              ? 'best'
                              : ''
                      }`}
                    >
                      {link.stockStatus === 'unavailable'
                        ? 'Unavailable'
                        : link.latestPrice === null
                          ? 'No price yet'
                          : formatMoney(link.latestPrice)}
                    </span>
                  )}
                  {link.url ? (
                    <a className="open-link" href={link.url} target="_blank" rel="noreferrer">
                      Open shop <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
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
        <p className="hint">Nothing tracked yet.</p>
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
