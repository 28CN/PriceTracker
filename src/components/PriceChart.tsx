'use client';

import { useEffect, useMemo, useState } from 'react';

import type { PriceInsightResponse } from '@/app/api/products/[id]/price-insight/route';
import { formatMoney } from '@/lib/format';
import type { PricePoint, Verdict } from '@/lib/priceInsight';

const W = 560;
const H = 160;
const PAD = { top: 10, right: 8, bottom: 6, left: 8 };

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

const GAP_MS = 7 * 86_400_000;

type Segment = { d: string; gap: boolean };

/**
 * Step segments between consecutive samples: the price holds until the next
 * sample, then steps. A hold longer than 7 days had no crawls, so it is marked
 * as a gap and drawn dashed instead of pretending we saw that price.
 */
function stepSegments(points: PricePoint[], x: (t: number) => number, y: (p: number) => number): Segment[] {
  const out: Segment[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const t0 = Date.parse(points[i - 1].at);
    const t1 = Date.parse(points[i].at);
    out.push({
      d: `M${x(t0)},${y(points[i - 1].price)}H${x(t1)}V${y(points[i].price)}`,
      gap: t1 - t0 > GAP_MS
    });
  }
  return out;
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
    const segments = stepSegments(lowest, x, y);
    // Shade only under observed stretches; a gap has no data to shade.
    const area = segments
      .filter((seg) => !seg.gap)
      .map((seg) => `${seg.d.replace(/V[^HV]*$/, '')}V${H - PAD.bottom}H${seg.d.split(',')[0].slice(1)}Z`)
      .join('');
    const hasGap = segments.some((seg) => seg.gap);
    const atl = insight.allTimeLow && Date.parse(insight.allTimeLow.at) >= t0 ? insight.allTimeLow : null;
    const dataLo = Math.min(...prices);
    const dataHi = Math.max(...prices);
    const ticks = dataHi - dataLo < 0.01 ? [dataLo] : [dataHi, (dataHi + dataLo) / 2, dataLo];
    return { x, y, segments, area, atl, hasGap, ticks, points: lowest, last: lowest[lowest.length - 1] };
  }, [state]);

  if (state.status === 'loading') {
    return (
      <div className="price-chart is-loading" aria-busy="true" aria-label="Loading price history">
        <div className="pc-skel-head">
          <span className="pc-skel" />
          <span className="pc-skel" />
          <span className="pc-skel" />
        </div>
        <div className="pc-plot">
          <div className="pc-canvas pc-skel" />
          <div className="pc-axis-labels">
            <span className="pc-skel" />
            <span className="pc-skel" />
          </div>
        </div>
      </div>
    );
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
        {product.targetPrice !== null ? (
          <span className="price-chart-meta pc-target-key">Target {formatMoney(product.targetPrice)}</span>
        ) : null}
        <span className="price-chart-meta">Last {range.days} days</span>
        {geo?.hasGap ? <span className="price-chart-meta pc-gap-key">Dashed: no checks for over 7 days</span> : null}
      </figcaption>

      {geo ? (
        <div className="pc-plot">
        <div className="pc-canvas">
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
          {geo.ticks.map((t) => (
            <line key={t} x1={PAD.left} x2={W - PAD.right} y1={geo.y(t)} y2={geo.y(t)} className="pc-grid" />
          ))}
          <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} className="pc-axis" />
          {product.targetPrice !== null ? (
            <g className="pc-target">
              <line x1={PAD.left} x2={W - PAD.right} y1={geo.y(product.targetPrice)} y2={geo.y(product.targetPrice)} />
            </g>
          ) : null}
          <path d={geo.area} fill={`url(#pc-fill-${productId})`} />
          {geo.segments.map((seg, i) => (
            <path key={i} d={seg.d} className={seg.gap ? 'pc-line pc-gap' : 'pc-line'} />
          ))}
          {geo.points.map((p) => (
            <circle key={p.at} className="pc-dot" cx={geo.x(Date.parse(p.at))} cy={geo.y(p.price)} r={1.8} />
          ))}
          {geo.atl ? (
            <g className="pc-atl">
              <circle cx={geo.x(Date.parse(geo.atl.at))} cy={geo.y(geo.atl.price)} r={4} />
              <title>All-time low {formatMoney(geo.atl.price)}</title>
            </g>
          ) : null}
          <circle className="pc-now" cx={geo.x(Date.parse(geo.last.at))} cy={geo.y(geo.last.price)} r={3.5} />
        </svg>
        {geo.ticks.map((t) => (
          <span key={t} className="pc-tick" style={{ top: `${(geo.y(t) / H) * 100}%` }} aria-hidden="true">
            {formatMoney(t)}
          </span>
        ))}
        {geo.atl && geo.atl.at !== geo.last.at ? (
          <span
            className="pc-label pc-label-atl"
            style={{ top: `${(geo.y(geo.atl.price) / H) * 100}%`, left: `${(geo.x(Date.parse(geo.atl.at)) / W) * 100}%` }}
            aria-hidden="true"
          >
            Low {formatMoney(geo.atl.price)}
          </span>
        ) : null}
        <span className="pc-label pc-label-now" style={{ top: `${(geo.y(geo.last.price) / H) * 100}%` }} aria-hidden="true">
          Now {formatMoney(geo.last.price)}
        </span>
        </div>
        <div className="pc-axis-labels" aria-hidden="true">
          <span>{new Date(range.from).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
          <span>Today</span>
        </div>
        </div>
      ) : (
        <p className="price-chart-empty">Not enough price history to draw a chart yet.</p>
      )}
    </figure>
  );
}
