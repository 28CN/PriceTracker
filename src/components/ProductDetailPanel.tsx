'use client';

import { Check, Target, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';

import ProductOfferRows from '@/components/ProductOfferRows';
import ProductVisual from '@/components/ProductVisual';
import { resolveCardPrice } from '@/lib/cardState';
import { formatMoney } from '@/lib/format';
import { productThumb } from '@/lib/productImage';
import { retailerKey } from '@/lib/retailer';
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

export default function ProductDetailPanel({
  product,
  readOnly,
  onClose
}: {
  product: ProductView;
  readOnly: boolean;
  onClose: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [product.id]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const activeLinks = product.links.filter((link) => link.isActive);
  const cardPrice = resolveCardPrice({ links: product.links, checkState: product.checkState });
  const lowestFreshPrice = cardPrice.cheapestFreshLink?.latestPrice ?? null;
  const hitsTarget =
    product.targetPrice !== null &&
    lowestFreshPrice !== null &&
    lowestFreshPrice <= product.targetPrice;
  const leadLink = cardPrice.headlineLink ?? (activeLinks.length === 1 ? activeLinks[0] : null);
  const thumb = productThumb(product, leadLink?.id);
  const shopSlug = leadLink ? retailerKey(leadLink.url || leadLink.retailer) : null;

  return (
    <aside
      className="detail-panel"
      aria-labelledby="detail-panel-heading"
      data-shop={shopSlug ?? undefined}
    >
      <header className="detail-panel-head">
        <div className="detail-panel-title-wrap">
          <span className="detail-panel-thumb">
            <ProductVisual
              key={thumb?.proxied || product.id}
              source={thumb}
              name={product.name}
              category={product.categoryName}
              shop={leadLink?.retailer}
              shopUrl={leadLink?.url}
            />
          </span>
          <div className="detail-panel-title-copy">
            <h2 id="detail-panel-heading" ref={headingRef} tabIndex={-1}>
              {product.name}
            </h2>
            <div className="detail-panel-meta">
              {product.categoryName ? <span className="chip">{product.categoryName}</span> : null}
              {product.targetPrice !== null ? (
                <span className={`goal-line${hitsTarget ? ' is-at-goal' : ''}`}>
                  {hitsTarget ? (
                    <Check size={13} strokeWidth={2.4} aria-hidden="true" />
                  ) : (
                    <Target size={13} strokeWidth={2} aria-hidden="true" />
                  )}
                  <span>
                    {hitsTarget ? 'Below goal' : 'Goal'} {formatMoney(product.targetPrice)}
                  </span>
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="icon-button detail-panel-close"
          onClick={onClose}
          aria-label="Close details"
          title="Close"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="detail-panel-body">
        {product.links.length > 0 ? <PriceChart productId={product.id} /> : null}
        <div className="rows">
          <ProductOfferRows product={product} readOnly={readOnly} />
        </div>
      </div>
    </aside>
  );
}
