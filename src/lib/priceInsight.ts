// Pure helpers for price trends and the "is this a real discount?" verdict.
// No I/O: the API route loads rows (under RLS) and passes them in.

export type PriceRow = {
  linkId: string;
  price: number | string;
  createdAt: string;
};

export type PricePoint = { at: string; price: number };

export type LinkSeries = { linkId: string; points: PricePoint[] };

export type Verdict =
  | 'insufficient_data'
  | 'fake_discount'
  | 'real_discount'
  | 'no_discount';

export type InsightReason =
  | 'too_few_samples'
  | 'history_too_short'
  | 'raised_before_drop'
  | 'below_median_90d'
  | 'below_median_30d'
  | 'not_below_median'
  | 'all_time_low';

export type PriceInsight = {
  verdict: Verdict;
  reasons: InsightReason[];
  currentPrice: number | null;
  allTimeLow: PricePoint | null;
  isAllTimeLow: boolean;
  median30d: number | null;
  median90d: number | null;
  /** (median90d - current) / median90d, e.g. 0.12 = 12% below. Null when unknown. */
  discountVsMedian90d: number | null;
  /** Daily samples in the 90-day window used for the verdict. */
  sampleCount: number;
  lastDrop: { at: string; from: number; to: number } | null;
  /** Set for fake_discount: the price before the raise, and the raised peak. */
  raise: { at: string; from: number; to: number } | null;
};

export const INSIGHT_RULES = {
  /** Fewer daily samples than this in 90 days -> insufficient_data. */
  minDailySamples: 5,
  /** History must span at least this many days. */
  minHistoryDays: 7,
  /** A price rise counts as a "raise" when at least this much (5%). */
  raiseThreshold: 0.05,
  /** Look this many days before the latest drop for a raise. */
  raiseLookbackDays: 14,
  /** A drop that lands within 2% of the pre-raise price (or above) is fake. */
  fakeTolerance: 0.02,
  /** Current must be at least this much (5%) under the 90-day median to be real. */
  realDiscountThreshold: 0.05
} as const;

const DAY_MS = 86_400_000;

function toNumber(value: number | string): number {
  return typeof value === 'number' ? value : Number(value);
}

function validPoint(p: PricePoint): boolean {
  return Number.isFinite(p.price) && p.price > 0 && Number.isFinite(Date.parse(p.at));
}

function byTime(a: PricePoint, b: PricePoint) {
  return Date.parse(a.at) - Date.parse(b.at);
}

/** Group raw rows into one ascending series per link, dropping invalid rows. */
export function buildSeries(rows: PriceRow[]): LinkSeries[] {
  const map = new Map<string, PricePoint[]>();
  for (const row of rows) {
    const point = { at: row.createdAt, price: toNumber(row.price) };
    if (!validPoint(point)) continue;
    const list = map.get(row.linkId) ?? [];
    list.push(point);
    map.set(row.linkId, list);
  }
  return [...map.entries()].map(([linkId, points]) => ({ linkId, points: points.sort(byTime) }));
}

/**
 * Product-level series: at every observation, the lowest latest-known price
 * across links. With `collapse` (default) consecutive equal prices are merged,
 * which suits a step chart; pass `collapse: false` for the verdict, which needs
 * every observation to count samples.
 */
export function lowestPriceSeries(series: LinkSeries[], { collapse = true } = {}): PricePoint[] {
  const events = series
    .flatMap((s) => s.points.map((p) => ({ ...p, linkId: s.linkId })))
    .sort(byTime);
  const latest = new Map<string, number>();
  const out: PricePoint[] = [];
  for (const e of events) {
    latest.set(e.linkId, e.price);
    const low = Math.min(...latest.values());
    const prev = out[out.length - 1];
    if (collapse && prev && prev.price === low) continue;
    if (prev && prev.at === e.at) {
      prev.price = low;
      continue;
    }
    out.push({ at: e.at, price: low });
  }
  return out;
}

/** Lowest price ever seen; the earliest occurrence wins ties. */
export function allTimeLow(points: PricePoint[]): PricePoint | null {
  let best: PricePoint | null = null;
  for (const p of [...points].sort(byTime)) {
    if (!validPoint(p)) continue;
    if (!best || p.price < best.price) best = p;
  }
  return best;
}

export function median(values: number[]): number | null {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * Last price per UTC day, so a crawler that samples 20x a day doesn't
 * outweigh a quiet week.
 */
export function dailyCloses(points: PricePoint[]): PricePoint[] {
  const byDay = new Map<string, PricePoint>();
  for (const p of [...points].sort(byTime)) {
    if (!validPoint(p)) continue;
    byDay.set(new Date(p.at).toISOString().slice(0, 10), p);
  }
  return [...byDay.values()];
}

/** The most recent observation that was lower than the one before it. */
export function lastDrop(points: PricePoint[]): { at: string; from: number; to: number; index: number } | null {
  const sorted = [...points].filter(validPoint).sort(byTime);
  for (let i = sorted.length - 1; i > 0; i -= 1) {
    if (sorted[i].price < sorted[i - 1].price) {
      return { at: sorted[i].at, from: sorted[i - 1].price, to: sorted[i].price, index: i };
    }
  }
  return null;
}

/**
 * Did the seller raise the price shortly before the latest drop, so the
 * "sale" just returns to (or stays above) the old price?
 */
export function findRaiseBeforeDrop(
  points: PricePoint[],
  rules = INSIGHT_RULES
): { at: string; from: number; to: number } | null {
  const sorted = [...points].filter(validPoint).sort(byTime);
  const drop = lastDrop(sorted);
  if (!drop) return null;
  const dropMs = Date.parse(drop.at);
  const windowStart = dropMs - rules.raiseLookbackDays * DAY_MS;
  for (let i = drop.index - 1; i > 0; i -= 1) {
    const cur = sorted[i];
    const prev = sorted[i - 1];
    if (Date.parse(cur.at) < windowStart) break;
    if (cur.price >= prev.price * (1 + rules.raiseThreshold)) {
      // Fake if the drop lands no lower than (about) the pre-raise price.
      if (drop.to >= prev.price * (1 - rules.fakeTolerance)) {
        return { at: cur.at, from: prev.price, to: cur.price };
      }
      return null;
    }
  }
  return null;
}

/** Judge whether the current (latest) price is a real discount. */
export function judgeDiscount(
  points: PricePoint[],
  options: { now?: Date; rules?: typeof INSIGHT_RULES } = {}
): PriceInsight {
  const rules = options.rules ?? INSIGHT_RULES;
  const nowMs = (options.now ?? new Date()).getTime();
  const sorted = [...points].filter(validPoint).sort(byTime);
  const current = sorted.at(-1) ?? null;
  const atl = allTimeLow(sorted);
  const daily90 = dailyCloses(sorted.filter((p) => Date.parse(p.at) >= nowMs - 90 * DAY_MS));
  const drop = lastDrop(sorted);

  const base: PriceInsight = {
    verdict: 'insufficient_data',
    reasons: [],
    currentPrice: current?.price ?? null,
    allTimeLow: atl,
    isAllTimeLow: Boolean(current && atl && current.price <= atl.price),
    median30d: null,
    median90d: null,
    discountVsMedian90d: null,
    sampleCount: daily90.length,
    lastDrop: drop ? { at: drop.at, from: drop.from, to: drop.to } : null,
    raise: null
  };
  if (!current) return { ...base, reasons: ['too_few_samples'] };

  // Baseline = daily closes before today's (the current) price.
  const utcDay = (at: string) => new Date(at).toISOString().slice(0, 10);
  const currentDay = utcDay(current.at);
  const history = daily90.filter((p) => utcDay(p.at) !== currentDay);
  const med90 = median(history.map((p) => p.price));
  const med30 = median(history.filter((p) => Date.parse(p.at) >= nowMs - 30 * DAY_MS).map((p) => p.price));
  base.median90d = med90;
  base.median30d = med30;
  base.discountVsMedian90d = med90 ? Math.round(((med90 - current.price) / med90) * 10_000) / 10_000 : null;

  const spanDays = (Date.parse(current.at) - Date.parse(sorted[0].at)) / DAY_MS;
  const insufficient: InsightReason[] = [];
  if (daily90.length < rules.minDailySamples) insufficient.push('too_few_samples');
  if (spanDays < rules.minHistoryDays) insufficient.push('history_too_short');
  if (insufficient.length || med90 === null) {
    return { ...base, reasons: insufficient.length ? insufficient : ['too_few_samples'] };
  }

  const reasons: InsightReason[] = [];
  if (base.isAllTimeLow) reasons.push('all_time_low');

  const raise = findRaiseBeforeDrop(sorted, rules);
  if (raise && drop && drop.index === sorted.length - 1 - countTrailingSame(sorted)) {
    return { ...base, verdict: 'fake_discount', raise, reasons: ['raised_before_drop', ...reasons] };
  }

  const below90 = current.price <= med90 * (1 - rules.realDiscountThreshold);
  const below30 = med30 === null || current.price <= med30 * (1 - rules.realDiscountThreshold);
  if (below90) reasons.push('below_median_90d');
  if (below30 && med30 !== null) reasons.push('below_median_30d');

  if (below90 && below30) return { ...base, verdict: 'real_discount', reasons };
  return { ...base, verdict: 'no_discount', reasons: [...reasons, 'not_below_median'] };
}

/** Points after the drop that kept the same price (the sale is still on). */
function countTrailingSame(sorted: PricePoint[]): number {
  let n = 0;
  for (let i = sorted.length - 1; i > 0 && sorted[i].price === sorted[i - 1].price; i -= 1) n += 1;
  return n;
}
