'use client';

import { ChevronDown, Pencil } from 'lucide-react';
import dynamic from 'next/dynamic';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import EditProductForm from '@/components/EditProductForm';
import ProductOfferRows from '@/components/ProductOfferRows';
import ProductVisual from '@/components/ProductVisual';
import RetailerLogo from '@/components/RetailerLogo';
import { resolveCardPrice, shopGapLabel } from '@/lib/cardState';
import { formatCheckedAt, formatLastSeen, formatMoney, latestTimestamp } from '@/lib/format';
import { goalCelebrationKey, prefersReducedMotion } from '@/lib/motion';
import { productThumb } from '@/lib/productImage';
import { hasCrawlerSupport, retailerKey } from '@/lib/retailer';
import type { ProductView } from '@/lib/types';

const MAX_GOAL_BURSTS_PER_LOAD = 3;
const GOAL_SPARK_COUNT = 8;
let goalBurstsThisLoad = 0;

function GoalBurst({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, 640);
    return () => window.clearTimeout(id);
  }, [onDone]);

  return (
    <span className="goal-burst" aria-hidden="true">
      {Array.from({ length: GOAL_SPARK_COUNT }, (_, idx) => (
        <span key={idx} className={`goal-spark goal-spark-${idx + 1}`} />
      ))}
    </span>
  );
}

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

// Memoised: selecting one card or typing in search does not re-render the others.
const ProductCard = memo(function ProductCard({
  product,
  readOnly,
  sidePanelActive,
  isSelected,
  onToggleSelect
}: {
  product: ProductView;
  readOnly: boolean;
  sidePanelActive: boolean;
  isSelected: boolean;
  onToggleSelect?: (productId: string, triggerEl: HTMLElement | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showGoalBurst, setShowGoalBurst] = useState(false);
  const openBtnRef = useRef<HTMLButtonElement>(null);
  const goalRef = useRef<HTMLSpanElement>(null);
  const handleGoalBurstDone = useCallback(() => setShowGoalBurst(false), []);

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

  useEffect(() => {
    if (!hitsTarget || lowestFreshPrice === null) return;
    if (prefersReducedMotion()) return;
    if (goalBurstsThisLoad >= MAX_GOAL_BURSTS_PER_LOAD) return;
    const el = goalRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const storageKey = goalCelebrationKey(product.id, lowestFreshPrice);
    try {
      if (window.sessionStorage.getItem(storageKey) === '1') return;
    } catch {
      // Ignore restricted sessionStorage.
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        if (prefersReducedMotion() || goalBurstsThisLoad >= MAX_GOAL_BURSTS_PER_LOAD) return;
        try {
          if (window.sessionStorage.getItem(storageKey) === '1') return;
          window.sessionStorage.setItem(storageKey, '1');
        } catch {
          // Proceed even when storage is unavailable.
        }
        goalBurstsThisLoad += 1;
        setShowGoalBurst(true);
      },
      { threshold: 0.25 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hitsTarget, lowestFreshPrice, product.id]);
  const shopGap = shopGapLabel(freshOffers, formatMoney);
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
  const shopSlug = shopSource ? retailerKey(shopSource.url || shopSource.retailer) : null;
  const thumb = productThumb(product, shopSource?.id);
  const shopLabel = shopRetailer
    ? shopRetailer
    : product.links.length > 0
      ? product.links.map((link) => link.retailer).join(', ')
      : '';
  const shopUnsupported = Boolean(shopSource && !hasCrawlerSupport(shopSource.url || shopSource.retailer));
  const showChecked = Boolean(checkedAt) && (headline.kind === 'price' || headline.kind === 'unavailable');

  const expanded = sidePanelActive ? isSelected : isOpen;
  const showInlineDetails = !sidePanelActive && !isEditing && isOpen;

  return (
    <article
      id={`p-${product.id}`}
      tabIndex={-1}
      data-shop={shopSlug ?? undefined}
      className={`card product-card${shopSource ? ' has-shop-accent' : ''}${
        hitsTarget ? ' is-at-goal' : ''
      }${isEditing ? ' is-editing' : ''}${sidePanelActive && isSelected ? ' is-selected' : ''}${
        showInlineDetails ? ' is-expanded-inline' : ''
      }`}
    >
      <div className="card-layout">
        <div className="card-main">
          <button
            ref={openBtnRef}
            type="button"
            className="card-open"
            aria-expanded={expanded}
            onClick={() => {
              if (isEditing) return;
              if (sidePanelActive && onToggleSelect) {
                onToggleSelect(product.id, openBtnRef.current);
              } else {
                setIsOpen((current) => !current);
              }
            }}
          >
            <span className="card-thumb-slot">
              <ProductVisual
                key={thumb?.proxied || product.id}
                source={thumb}
                name={product.name}
                category={product.categoryName}
              />
            </span>
            <span className="product-title-copy">
              <h2 className="product-name">{product.name}</h2>
              {product.categoryName ? <span className="chip">{product.categoryName}</span> : null}
              {product.targetPrice !== null ? (
                <span className={`goal-line${hitsTarget ? ' is-at-goal' : ''}`}>
                  <span ref={goalRef} className="goal-line-text">
                    {hitsTarget ? 'Below goal' : 'Goal'} {formatMoney(product.targetPrice)}
                    {showGoalBurst ? <GoalBurst onDone={handleGoalBurstDone} /> : null}
                  </span>
                </span>
              ) : null}
            </span>
            <ChevronDown
              className={`card-chevron${expanded ? ' is-open' : ''}`}
              size={16}
              aria-hidden="true"
            />
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
              <Pencil size={16} aria-hidden="true" />
              Edit
            </button>
          ) : null}
        </div>

        <div className="price-rail">
          {headline.kind === 'price' ? (
            <span className={`price${hitsTarget ? ' is-at-goal' : ''}`}>{formatMoney(headline.price)}</span>
          ) : null}
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

      {showInlineDetails ? (
        <div className="rows">
          {product.links.length > 0 ? <PriceChart productId={product.id} /> : null}
          <ProductOfferRows product={product} readOnly={readOnly} />
        </div>
      ) : null}
    </article>
  );
});

export default function ProductList({
  products,
  readOnly = false,
  sidePanelActive = false,
  selectedProductId = null,
  onToggleSelect
}: {
  products: ProductView[];
  readOnly?: boolean;
  sidePanelActive?: boolean;
  selectedProductId?: string | null;
  onToggleSelect?: (productId: string, triggerEl: HTMLElement | null) => void;
}) {
  if (products.length === 0) {
    return (
      <div className="card empty">
        <p className="hint">Nothing tracked yet.</p>
      </div>
    );
  }

  return (
    <div className="product-list-container">
      <div className="stack product-grid">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            readOnly={readOnly}
            sidePanelActive={sidePanelActive}
            isSelected={selectedProductId === product.id}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </div>
    </div>
  );
}
