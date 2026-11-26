'use client';

import {
  ArrowUpRight,
  BadgeDollarSign,
  ChevronRight,
  Package,
  TrendingDown,
  UserRound,
  X
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useMemo, useRef } from 'react';

import CountUp from '@/components/CountUp';
import ProductVisual from '@/components/ProductVisual';
import { resolveCardPrice } from '@/lib/cardState';
import { formatMoney } from '@/lib/format';
import type { OverviewResponse } from '@/lib/overview';
import { productThumb } from '@/lib/productImage';
import type { ProductView } from '@/lib/types';

function Sparkline({
  points,
  tone,
  loading
}: {
  points: number[] | null;
  tone: 'brand' | 'success' | 'cyan';
  loading: boolean;
}) {
  const gradId = useId();
  if (loading || !points) {
    return <span className="summary-spark-skel" aria-hidden="true" />;
  }

  const w = 68;
  const h = 22;
  const padX = 2;
  const padY = 3;
  const count = points.length;
  if (count === 0) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min;

  const coords = points.map((value, idx) => {
    const x =
      count === 1
        ? w / 2
        : padX + (idx / (count - 1)) * (w - padX * 2);
    const ratio = span < 0.001 ? (value > 0 ? 0.5 : 0.15) : (value - min) / span;
    const y = h - padY - ratio * (h - padY * 2);
    return { x, y };
  });

  const line = coords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = [
    `M${coords[0].x.toFixed(1)},${h}`,
    ...coords.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    `L${coords[coords.length - 1].x.toFixed(1)},${h}`,
    'Z'
  ].join(' ');
  const last = coords[coords.length - 1];

  return (
    <svg
      className={`summary-spark summary-spark-${tone}`}
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r="2.2" fill="currentColor" />
    </svg>
  );
}

export default function DashboardHero({
  products,
  accountHref,
  title = 'Your tracked prices',
  showSummaryStrip = false,
  overview = null,
  overviewStatus = 'ready'
}: {
  products: ProductView[];
  accountHref: string | null;
  title?: string;
  showSummaryStrip?: boolean;
  overview?: OverviewResponse | null;
  overviewStatus?: 'loading' | 'ready' | 'error';
}) {
  const deals = useMemo(() => {
    return products.flatMap((product) => {
      if (product.targetPrice === null) return [];
      const { cheapestFreshLink } = resolveCardPrice({
        links: product.links,
        checkState: product.checkState
      });
      if (!cheapestFreshLink || cheapestFreshLink.latestPrice === null) return [];
      if (cheapestFreshLink.latestPrice > product.targetPrice) return [];
      return [{ product, bestLink: cheapestFreshLink, price: cheapestFreshLink.latestPrice }];
    });
  }, [products]);

  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.setAttribute('closedby', 'any');
  }, []);

  function openDialog() {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
  }

  function closeDialog() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
  }

  const isLoadingOverview = overviewStatus === 'loading';

  return (
    <>
      {showSummaryStrip ? (
        <section className="dashboard-overview is-strip">
          <div className="overview-top">
            <div className="overview-copy">
              <h1>{title}</h1>
            </div>
            {accountHref ? (
              <Link className="account-pill" href={accountHref}>
                <UserRound size={16} aria-hidden="true" />
                <span>Alerts &amp; profile</span>
              </Link>
            ) : null}
          </div>

          <div className="summary-strip" role="region" aria-label="Summary">
            <div className="summary-tile">
              <div className="summary-tile-head">
                <span className="summary-tile-icon">
                  <Package size={16} aria-hidden="true" />
                </span>
                <span className="summary-tile-label">Tracked</span>
              </div>
              <div className="summary-tile-body">
                <strong className="summary-tile-value">
                  <CountUp value={products.length} />
                </strong>
                <Sparkline
                  points={overview?.sparklines.tracked ?? null}
                  tone="brand"
                  loading={isLoadingOverview}
                />
              </div>
            </div>

            <button
              type="button"
              className={`summary-tile is-interactive${deals.length > 0 ? ' is-positive' : ''}`}
              onClick={openDialog}
              aria-haspopup="dialog"
            >
              <div className="summary-tile-head">
                <span className="summary-tile-icon is-success">
                  <BadgeDollarSign size={16} aria-hidden="true" />
                </span>
                <span className="summary-tile-label">Below goal</span>
                <ChevronRight className="summary-tile-chevron" size={16} aria-hidden="true" />
              </div>
              <div className="summary-tile-body">
                <strong className="summary-tile-value">
                  <CountUp value={deals.length} />
                </strong>
                <Sparkline
                  points={overview?.sparklines.belowGoal ?? null}
                  tone="success"
                  loading={isLoadingOverview}
                />
              </div>
            </button>

            <div className="summary-tile">
              <div className="summary-tile-head">
                <span className="summary-tile-icon is-cyan">
                  <TrendingDown size={16} aria-hidden="true" />
                </span>
                <span className="summary-tile-label">Dropped this week</span>
              </div>
              <div className="summary-tile-body">
                {isLoadingOverview ? (
                  <span className="summary-value-skel" aria-busy="true" aria-label="Loading" />
                ) : (
                  <strong className="summary-tile-value">
                    <CountUp value={overview?.droppedThisWeekCount ?? 0} />
                  </strong>
                )}
                <Sparkline
                  points={overview?.sparklines.dropped ?? null}
                  tone="cyan"
                  loading={isLoadingOverview}
                />
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="dashboard-overview">
          <div className="overview-copy">
            <h1>{title}</h1>
          </div>

          <div className="overview-actions">
            <button type="button" className="target-summary" onClick={openDialog} aria-haspopup="dialog">
              <span className="target-summary-icon">
                <BadgeDollarSign size={16} aria-hidden="true" />
              </span>
              <span className="target-summary-copy">
                <strong>{deals.length} below goal</strong>
              </span>
              <ChevronRight className="target-summary-arrow" size={16} aria-hidden="true" />
            </button>

            {accountHref ? (
              <Link className="account-slot" href={accountHref}>
                <span className="account-slot-icon">
                  <UserRound size={16} aria-hidden="true" />
                </span>
                <span>
                  <strong>Alerts &amp; profile</strong>
                </span>
              </Link>
            ) : null}
          </div>
        </section>
      )}

      <dialog
        ref={dialogRef}
        className="deal-dialog"
        aria-labelledby="deal-dialog-title"
        onMouseDown={(event) => {
          const dialog = event.currentTarget;
          const rect = dialog.getBoundingClientRect();
          const inside =
            event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom;
          if (!inside) dialog.close();
        }}
      >
        <header className="deal-dialog-head">
          <h2 id="deal-dialog-title">Below your goal</h2>
          <button type="button" className="icon-button" onClick={closeDialog} aria-label="Close">
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="deal-list">
          {deals.map(({ product, bestLink, price }) => {
            const thumb = productThumb(product, bestLink.id);
            return (
              <article className="deal-row" key={product.id}>
                <ProductVisual
                  source={thumb}
                  name={product.name}
                  category={product.categoryName}
                  shop={bestLink.retailer}
                  shopUrl={bestLink.url}
                />
                <div className="deal-row-main">
                  <strong>{product.name}</strong>
                  <span>
                    {product.categoryName || 'Uncategorised'} · {bestLink.retailer}
                  </span>
                  <small>Goal {formatMoney(product.targetPrice)}</small>
                </div>
                <div className="deal-row-price">
                  <strong>{formatMoney(price)}</strong>
                  {bestLink.url ? (
                    <a href={bestLink.url} target="_blank" rel="noreferrer">
                      Open shop <ArrowUpRight size={16} aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })}

          {deals.length === 0 ? (
            <div className="deal-empty">
              <BadgeDollarSign size={24} aria-hidden="true" />
              <strong>Nothing below goal yet</strong>
            </div>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
