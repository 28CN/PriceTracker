'use client';

import { useEffect, useMemo, useState } from 'react';

import type { PriceInsightResponse } from '@/app/api/products/[id]/price-insight/route';
import { formatMoney } from '@/lib/format';
import type { PricePoint, Verdict } from '@/lib/priceInsight';

const W = 560;
const H = 160;
const PAD = { top: 14, right: 12, bottom: 22, left: 12 };

const VERDICT_COPY: Record<Verdict, { label: string; tone: string }> = {
  real_discount: { label: 'Real discount', tone: 'good' },
  fake_discount: { label: 'Raised before the drop', tone: 'warn' },
  no_discount: { label: 'Usual price', tone: 'neutral' },
  insufficient_data: { label: 'Not enough history yet', tone: 'neutral' }
};

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: PriceInsightResponse };

/** Step path: price holds until the next sample, like a shelf tag. */
function stepPath(points: PricePoint[], x: (t: number) => number, y: (p: number) => number) {
  return points
    .map((p, i) => {
      const px = x(Date.parse(p.at));
      const py = y(p.price);
      if (i === 0) return `M${px},${py}`;
      return `H${px}V${py}`;
    })
    .join('');
}

export default function PriceChart({ productId, days = 180 }: { productId: string; days?: number }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/products/${productId}/price-insight?days=${days}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: PriceInsightResponse) => setState({ status: 'ready', data }))
      .catch(() => {
        if (!ctrl.signal.aborted) setState({ status: 'error' });
      });
    return () => ctrl.abort();
  }, [productId, days]);

  const geo = useMemo(() => {
    if (state.status !== 'ready') return null;
    const { lowest, range, product, insight } = state.data;
    if (lowest.length < 2) return null;
    const t0 = Date.parse(range.from);
    const t1 = Date.parse(range.to);
    const prices = lowest.map((p) => p.price);
    if (product.targetPrice !== null) prices.push(product.targetPrice);
    let lo = Math.min(...prices);
    let hi = Math.max(...prices);
    const span = hi - lo || hi * 0.1 || 1;
    lo -= span * 0.12;
    hi += span * 0.12;
    const x = (t: number) => PAD.left + ((t - t0) / Math.max(t1 - t0, 1)) * (W - PAD.left - PAD.right);
    const y = (p: number) => PAD.top + (1 - (p - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
    const extended = [...lowest, { at: range.to, price: lowest[lowest.length - 1].price }];
    const line = stepPath(extended, x, y);
    const area = `${line}V${H - PAD.bottom}H${x(Date.parse(lowest[0].at))}Z`;
    const atl = insight.allTimeLow && Date.parse(insight.allTimeLow.at) >= t0 ? insight.allTimeLow : null;
    return { x, y, line, area, atl, last: lowest[lowest.length - 1] };
  }, [state]);

  if (state.status === 'loading') {
    return <div className="price-chart is-loading" aria-busy="true" aria-label="Loading price history" />;
  }
  if (state.status === 'error') {
    return <p className="price-chart-empty">Price history is unavailable right now.</p>;
  }

  const { insight, product, range } = state.data;
  const verdict = VERDICT_COPY[insight.verdict];

  return (
    <figure className="price-chart">
      <figcaption className="price-chart-head">
        <span className={`verdict-pill tone-${verdict.tone}`}>{verdict.label}</span>
        {insight.isAllTimeLow ? <span className="verdict-pill tone-good">All-time low</span> : null}
        {insight.median90d !== null ? (
          <span className="price-chart-meta">90-day median {formatMoney(insight.median90d)}</span>
        ) : null}
        <span className="price-chart-meta">Last {range.days} days</span>
      </figcaption>

      {geo ? (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="price-chart-svg"
          role="img"
          aria-label={`Lowest price over the last ${range.days} days, now ${formatMoney(geo.last.price)}`}
        >
          <defs>
            <linearGradient id={`pc-fill-${productId}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} className="pc-axis" />
          {product.targetPrice !== null ? (
            <g className="pc-target">
              <line x1={PAD.left} x2={W - PAD.right} y1={geo.y(product.targetPrice)} y2={geo.y(product.targetPrice)} />
              <text x={W - PAD.right} y={geo.y(product.targetPrice) - 4} textAnchor="end">
                Target {formatMoney(product.targetPrice)}
              </text>
            </g>
          ) : null}
          <path d={geo.area} fill={`url(#pc-fill-${productId})`} />
          <path d={geo.line} className="pc-line" />
          {geo.atl ? (
            <g className="pc-atl">
              <circle cx={geo.x(Date.parse(geo.atl.at))} cy={geo.y(geo.atl.price)} r={4} />
              <title>All-time low {formatMoney(geo.atl.price)}</title>
            </g>
          ) : null}
          <circle className="pc-now" cx={W - PAD.right} cy={geo.y(geo.last.price)} r={3.5} />
          <text className="pc-date" x={PAD.left} y={H - 6}>{new Date(range.from).toLocaleDateString()}</text>
          <text className="pc-date" x={W - PAD.right} y={H - 6} textAnchor="end">Today</text>
        </svg>
      ) : (
        <p className="price-chart-empty">Not enough price history to draw a chart yet.</p>
      )}
    </figure>
  );
}
