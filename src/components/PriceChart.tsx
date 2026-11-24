'use client';

import InfoTip from './InfoTip';
import { useEffect, useId, useMemo, useState } from 'react';

import type { PriceInsightResponse, UsualPriceStep } from '@/lib/priceInsightTypes';
import { coverageText, lineEnd, mergePeriods, sydneyDate, type ChartPeriod } from '@/lib/chartPeriods';
import { formatLastSeen, formatMoney } from '@/lib/format';
import { prefersReducedMotion } from '@/lib/motion';
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

/** Visible usual-price prices over [t0, t1], used for axis scaling and the dashed step path. */
function visibleUsualSteps(steps: UsualPriceStep[], t0: number, t1: number): { atMs: number; price: number }[] {
  if (steps.length === 0) return [];
  const parsed = steps
    .map((s) => ({ atMs: Date.parse(s.from), price: s.price }))
    .filter((s) => Number.isFinite(s.atMs) && Number.isFinite(s.price))
    .sort((a, b) => a.atMs - b.atMs);
  if (parsed.length === 0) return [];

  let activeAtStart: { atMs: number; price: number } | null = null;
  const inside: { atMs: number; price: number }[] = [];
  for (const s of parsed) {
    if (s.atMs <= t0) activeAtStart = s;
    else if (s.atMs <= t1) inside.push(s);
  }

  const out: { atMs: number; price: number }[] = [];
  if (activeAtStart) out.push({ atMs: t0, price: activeAtStart.price });
  out.push(...inside);
  return out;
}

function usualStepPath(
  steps: { atMs: number; price: number }[],
  t1: number,
  x: (t: number) => number,
  y: (p: number) => number
): string {
  if (steps.length === 0) return '';
  let d = `M${x(steps[0].atMs).toFixed(1)},${y(steps[0].price).toFixed(1)}`;
  for (let i = 1; i < steps.length; i += 1) {
    d += `H${x(steps[i].atMs).toFixed(1)}V${y(steps[i].price).toFixed(1)}`;
  }
  d += `H${x(t1).toFixed(1)}`;
  return d;
}

export default function PriceChart({ productId, days = 180 }: { productId: string; days?: number }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [revealDone, setRevealDone] = useState(false);
  const clipId = `pc-reveal-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    if (prefersReducedMotion()) setRevealDone(true);
  }, []);

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

  const leadingUsual = useMemo(() => {
    if (state.status !== 'ready') return null;
    const { links, leadingLinkId } = state.data;
    const match =
      (leadingLinkId ? links.find((l) => l.linkId === leadingLinkId) : null) ??
      links.find((l) => l.usual && l.usual.currentUsual !== null) ??
      null;
    return match?.usual ?? null;
  }, [state]);

  const periodGeo = useMemo(() => {
    if (state.status !== 'ready') return null;
    const { links, product } = state.data;
    const merged = mergePeriods(links ?? []);
    if (!merged || merged.coverage.observed === 0) return null;
    const { periods } = merged;
    const seen = periods.filter((p): p is ChartPeriod & { minPrice: number } => p.minPrice !== null);
    const t0 = periods[0].startMs;
    const t1 = periods[periods.length - 1].endMs;
    const usualSteps = leadingUsual && !leadingUsual.lowConfidence ? visibleUsualSteps(leadingUsual.series, t0, t1) : [];
    const prices = seen.map((p) => p.minPrice);
    if (product.targetPrice !== null) prices.push(product.targetPrice);
    for (const s of usualSteps) prices.push(s.price);
    let lo = Math.min(...prices);
    let hi = Math.max(...prices);
    const span = hi - lo || hi * 0.1 || 1;
    lo -= span * 0.35;
    hi += span * 0.3;
    const x = (t: number) => PAD.left + ((t - t0) / Math.max(t1 - t0, 1)) * (W - PAD.left - PAD.right);
    const y = (p: number) => PAD.top + (1 - (p - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
    const lowest = seen.reduce((a, b) => (b.minPrice < a.minPrice ? b : a));
    // "Now" is the end of the line, not an earlier low and not a price from another series.
    const end = lineEnd(periods);
    const now = end?.price ?? null;
    const nowAt = end?.atMs ?? null;
    const dataLo = Math.min(...prices);
    const dataHi = Math.max(...prices);
    const ticks = dataHi - dataLo < 0.01 ? [dataLo] : [dataHi, (dataHi + dataLo) / 2, dataLo];
    // One continuous step line: solid across checked weeks, dashed across unchecked ones.
    let solid = '';
    let dashed = '';
    let prev: { x: number; y: number } | null = null;
    let prevEnd = -1;
    periods.forEach((p, i) => {
      if (p.minPrice === null) return;
      const xs = x(p.startMs);
      const xe = x(p.endMs);
      const yy = y(p.minPrice);
      if (prev) {
        if (prevEnd === i - 1) solid += `V${yy.toFixed(1)}`;
        else dashed += `M${prev.x.toFixed(1)},${prev.y.toFixed(1)}H${xs.toFixed(1)}V${yy.toFixed(1)}`;
      }
      solid += `${prev && prevEnd === i - 1 ? '' : `M${xs.toFixed(1)},${yy.toFixed(1)}`}H${xe.toFixed(1)}`;
      prev = { x: xe, y: yy };
      prevEnd = i;
    });
    const usualPath = usualStepPath(usualSteps, t1, x, y);
    return {
      x, y, periods, ticks, lowest, now, nowAt, solid, dashed, usualPath,
      hasUnchecked: merged.coverage.observed < merged.coverage.total,
      coverage: coverageText(merged.coverage, merged.cycleDays),
      from: periods[0].start
    };
  }, [state, leadingUsual]);

  const geo = useMemo(() => {
    if (state.status !== 'ready' || periodGeo) return null;
    const { lowest, range, product, insight } = state.data;
    if (lowest.length < 2) return null;
    const t0 = Date.parse(range.from);
    const t1 = Date.parse(range.to);
    const usualSteps = leadingUsual && !leadingUsual.lowConfidence ? visibleUsualSteps(leadingUsual.series, t0, t1) : [];
    const prices = lowest.map((p) => p.price);
    if (product.targetPrice !== null) prices.push(product.targetPrice);
    for (const s of usualSteps) prices.push(s.price);
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
    const usualPath = usualStepPath(usualSteps, t1, x, y);
    return { x, y, segments, area, atl, hasGap, ticks, usualPath, points: lowest, last: lowest[lowest.length - 1] };
  }, [state, periodGeo, leadingUsual]);

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
  const displayUsual = insight.usualPrice ?? leadingUsual?.currentUsual ?? null;
  const discountPct =
    insight.verdict === 'real_discount' && insight.discountVsUsual !== null && insight.discountVsUsual >= 0.01
      ? Math.round(insight.discountVsUsual * 100)
      : null;
  const latestShift = leadingUsual?.shifts.at(-1) ?? null;
  const shiftDate = latestShift ? formatLastSeen(latestShift.at) : '';
  const hasUsualLine = Boolean(periodGeo?.usualPath || geo?.usualPath);

  return (
    <figure className="price-chart">
      <figcaption className="price-chart-head">
        <span className={`verdict-pill tone-${verdict.tone}`}>
          {discountPct ? `${verdict.label} · ${discountPct}% off` : verdict.label}
        </span>
        {insight.isAllTimeLow ? <span className="verdict-pill tone-good">All-time low</span> : null}
        {displayUsual !== null ? (
          <span className={`price-chart-meta${hasUsualLine ? ' pc-usual-key' : ''}`}>
            Usual {formatMoney(displayUsual)}
          </span>
        ) : null}
        {periodGeo ? (
          <InfoTip label="How often we checked">{periodGeo.coverage}</InfoTip>
        ) : (
          <span className="price-chart-meta">Last {range.days} days</span>
        )}
        {/* Legend for the hatched weeks / dashed stretches: past gaps, not today's check. */}
        {periodGeo?.hasUnchecked ? <span className="price-chart-meta pc-hatch-key">Weeks not checked</span> : null}
        {geo?.hasGap ? <span className="price-chart-meta pc-gap-key">Days not checked</span> : null}
      </figcaption>

      {periodGeo ? (
        <div className="pc-plot">
          <div className="pc-canvas">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="price-chart-svg"
              role="img"
              aria-label={`Lowest price each sale week since ${sydneyDate(periodGeo.from)}. Lowest ${formatMoney(periodGeo.lowest.minPrice)}, now ${formatMoney(periodGeo.now)}. ${periodGeo.coverage}.`}
            >
              <defs>
                <pattern id={`pc-hatch-${productId}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="6" className="pc-hatch-line" />
                </pattern>
                <clipPath id={clipId}>
                  <rect
                    x={0}
                    y={0}
                    width={W}
                    height={H}
                    className={revealDone ? undefined : 'pc-reveal-rect'}
                    onAnimationEnd={() => setRevealDone(true)}
                  />
                </clipPath>
              </defs>
              {periodGeo.ticks.map((t) => (
                <line key={t} x1={PAD.left} x2={W - PAD.right} y1={periodGeo.y(t)} y2={periodGeo.y(t)} className="pc-grid" />
              ))}
              <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} className="pc-axis" />
              {periodGeo.periods.map((p) =>
                p.observed ? null : (
                  <rect
                    key={p.start}
                    className="pc-unchecked"
                    x={periodGeo.x(p.startMs) + 0.5}
                    y={PAD.top}
                    width={Math.max(periodGeo.x(p.endMs) - periodGeo.x(p.startMs) - 1, 1)}
                    height={H - PAD.top - PAD.bottom}
                    fill={`url(#pc-hatch-${productId})`}
                  >
                    <title>{`Not checked ${sydneyDate(p.start)} – ${sydneyDate(p.endMs - 1)}`}</title>
                  </rect>
                )
              )}
              {product.targetPrice !== null ? (
                <g className="pc-target">
                  <line x1={PAD.left} x2={W - PAD.right} y1={periodGeo.y(product.targetPrice)} y2={periodGeo.y(product.targetPrice)} />
                </g>
              ) : null}
              <g clipPath={`url(#${clipId})`}>
                {periodGeo.usualPath ? <path d={periodGeo.usualPath} className="pc-usual" /> : null}
                {periodGeo.dashed ? <path d={periodGeo.dashed} className="pc-step pc-step-gap" /> : null}
                <path d={periodGeo.solid} className="pc-step" />
                {periodGeo.periods.map((p) =>
                  p.minPrice === null ? null : (
                    <line
                      key={p.start}
                      className={p === periodGeo.lowest ? 'pc-period is-lowest' : 'pc-period'}
                      x1={periodGeo.x(p.startMs) + 1.5}
                      x2={periodGeo.x(p.endMs) - 1.5}
                      y1={periodGeo.y(p.minPrice)}
                      y2={periodGeo.y(p.minPrice)}
                    >
                      <title>{`${sydneyDate(p.start)} – ${sydneyDate(p.endMs - 1)}: lowest ${formatMoney(p.minPrice)}`}</title>
                    </line>
                  )
                )}
              </g>
            </svg>
            {periodGeo.ticks.map((t) => (
              <span key={t} className="pc-tick" style={{ top: `${(periodGeo.y(t) / H) * 100}%` }} aria-hidden="true">
                {formatMoney(t)}
              </span>
            ))}
            {periodGeo.now !== null && periodGeo.lowest.minPrice < periodGeo.now ? (
              <span
                className="pc-label pc-label-atl"
                style={{
                  top: `${(periodGeo.y(periodGeo.lowest.minPrice) / H) * 100}%`,
                  left: `${(periodGeo.x((periodGeo.lowest.startMs + periodGeo.lowest.endMs) / 2) / W) * 100}%`
                }}
                aria-hidden="true"
              >
                Lowest {formatMoney(periodGeo.lowest.minPrice)}
              </span>
            ) : null}
            {periodGeo.now !== null && periodGeo.nowAt !== null ? (
              <span
                className="pc-label pc-label-now"
                style={{
                  top: `${(periodGeo.y(periodGeo.now) / H) * 100}%`,
                  left: `${(periodGeo.x(periodGeo.nowAt) / W) * 100}%`
                }}
                aria-hidden="true"
              >
                Now {formatMoney(periodGeo.now)}
              </span>
            ) : null}
          </div>
          <div className="pc-axis-labels" aria-hidden="true">
            <span>{sydneyDate(periodGeo.from)}</span>
            <span>This week</span>
          </div>
          {latestShift && shiftDate ? (
            <p className="pc-shift-note">
              Usual price went {latestShift.direction === 'up' ? 'up' : 'down'} to{' '}
              {formatMoney(latestShift.to)} · <time dateTime={latestShift.at}>{shiftDate}</time>
            </p>
          ) : null}
        </div>
      ) : geo ? (
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
            <clipPath id={clipId}>
              <rect
                x={0}
                y={0}
                width={W}
                height={H}
                className={revealDone ? undefined : 'pc-reveal-rect'}
                onAnimationEnd={() => setRevealDone(true)}
              />
            </clipPath>
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
          <g clipPath={`url(#${clipId})`}>
            {geo.usualPath ? <path d={geo.usualPath} className="pc-usual" /> : null}
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
          </g>
        </svg>
        {geo.ticks.map((t) => (
          <span key={t} className="pc-tick" style={{ top: `${(geo.y(t) / H) * 100}%` }} aria-hidden="true">
            {formatMoney(t)}
          </span>
        ))}
        {geo.atl && geo.atl.price !== geo.last.price ? (
          <span
            className="pc-label pc-label-atl"
            style={{ top: `${(geo.y(geo.atl.price) / H) * 100}%`, left: `${(geo.x(Date.parse(geo.atl.at)) / W) * 100}%` }}
            aria-hidden="true"
          >
            Lowest {formatMoney(geo.atl.price)}
          </span>
        ) : null}
        <span
          className="pc-label pc-label-now"
          style={{
            top: `${(geo.y(geo.last.price) / H) * 100}%`,
            left: `${(geo.x(Date.parse(geo.last.at)) / W) * 100}%`
          }}
          aria-hidden="true"
        >
          Now {formatMoney(geo.last.price)}
        </span>
        </div>
        <div className="pc-axis-labels" aria-hidden="true">
          <span>{sydneyDate(range.from)}</span>
          <span>Today</span>
        </div>
        {latestShift && shiftDate ? (
          <p className="pc-shift-note">
            Usual price went {latestShift.direction === 'up' ? 'up' : 'down'} to{' '}
            {formatMoney(latestShift.to)} · <time dateTime={latestShift.at}>{shiftDate}</time>
          </p>
        ) : null}
        </div>
      ) : (
        <p className="price-chart-empty">Not enough price history to draw a chart yet.</p>
      )}
    </figure>
  );
}
