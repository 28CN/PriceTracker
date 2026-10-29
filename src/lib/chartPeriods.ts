/**
 * Merge per-link promo periods into one product-level row for the chart:
 * the grid comes from the link with the most periods, and each grid period
 * takes the lowest observed price of any link period overlapping it.
 * Pure: no React/Next imports.
 */
import type { PromoCoverage, PromoPeriod } from './promoPeriods';

type LinkPeriods = { periods: PromoPeriod[]; promo: { cycleDays: number } };

export type ChartPeriod = PromoPeriod & { startMs: number; endMs: number };

export type MergedPeriods = { periods: ChartPeriod[]; coverage: PromoCoverage; cycleDays: number };

export function mergePeriods(links: LinkPeriods[]): MergedPeriods | null {
  const grid = [...links].sort(
    (a, b) =>
      b.periods.length - a.periods.length ||
      b.periods.filter((p) => p.observed).length - a.periods.filter((p) => p.observed).length
  )[0];
  if (!grid || grid.periods.length === 0) return null;

  const all = links.flatMap((l) =>
    l.periods
      .filter((p) => p.observed && p.minPrice !== null)
      .map((p) => ({ s: Date.parse(p.start), e: Date.parse(p.end), price: p.minPrice as number }))
  );

  const periods: ChartPeriod[] = grid.periods.map((g) => {
    const startMs = Date.parse(g.start);
    const endMs = Date.parse(g.end);
    const hits = all.filter((p) => p.s < endMs && p.e > startMs);
    const minPrice = hits.length ? Math.min(...hits.map((h) => h.price)) : null;
    return { start: g.start, end: g.end, startMs, endMs, minPrice, observed: minPrice !== null };
  });

  const observed = periods.filter((p) => p.observed).length;
  return {
    periods,
    coverage: { observed, total: periods.length, ratio: periods.length ? observed / periods.length : 0 },
    cycleDays: grid.promo.cycleDays
  };
}

/** Plain-words coverage, e.g. 'Checked 6 of 8 sale weeks'. */
export function coverageText(c: PromoCoverage, cycleDays: number): string {
  const unit = cycleDays === 7 ? 'sale week' : cycleDays === 14 ? 'sale fortnight' : 'sale period';
  return `Checked ${c.observed} of ${c.total} ${unit}${c.total === 1 ? '' : 's'}`;
}

/** Short date on the Sydney calendar, e.g. '28 Oct'. */
export function sydneyDate(iso: string | number): string {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' });
}
