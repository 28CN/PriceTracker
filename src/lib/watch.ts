// Price watch: what to buy now, what to wait for, and what moved this week.
// Pure helpers over a link's daily prices; the page loads the data.
import { judgeDiscount, type PricePoint, type Verdict } from '@/lib/priceInsight';
import { computeUsualPrice } from '@/lib/usualPrice';

const DAY_MS = 86_400_000;

export const WATCH_RULES = {
  /** A day counts as "on sale" at this much below the usual price. */
  saleDepth: 0.2,
  /** Sale days closer than this belong to the same sale. */
  sameSaleDays: 10,
  /** Sales needed before we guess a rhythm (gives 2 gaps). */
  minSales: 3,
  /** Every gap must sit within this share of the typical gap. */
  gapTolerance: 0.4,
  minCycleDays: 14,
  maxCycleDays: 120,
  /** "Wait" when the next sale is this close. */
  waitWithinDays: 14,
  /** Weekly change: compare with the price a week ago (no older than this). */
  weekAgoMaxDays: 21,
  /** Ignore moves smaller than this (both must hold). */
  minMovePct: 0.01,
  minMoveDollars: 0.05,
  /** "Near lowest ever" margin. */
  nearLowPct: 0.02
} as const;

export type SaleCycle = {
  /** Typical days between sale starts. */
  everyDays: number;
  /** ISO day the next sale should start (today or later). */
  next: string;
  /** Typical saving in a sale, e.g. 0.5 = half price. */
  depth: number;
  sales: number;
};

const dayOf = (at: string) => at.slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(dayOf(b)) - Date.parse(dayOf(a))) / DAY_MS);
const median = (values: number[]) => {
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Usual price in force at each point (step series from computeUsualPrice). */
function usualAt(points: PricePoint[], now: Date): (number | null)[] {
  const usual = computeUsualPrice(points, { now });
  if (usual.lowConfidence || usual.series.length === 0) return points.map(() => null);
  return points.map((point) => {
    let price: number | null = usual.series[0].price;
    for (const step of usual.series) if (step.from <= point.at) price = step.price;
    return price;
  });
}

/**
 * Repeating sale rhythm for one shop's prices, e.g. half price every ~4 weeks.
 * Needs 3+ separate sales with steady gaps; otherwise null (no guessing).
 */
export function saleCycle(points: PricePoint[], now = new Date(), rules = WATCH_RULES): SaleCycle | null {
  const sorted = points.toSorted((a, b) => a.at.localeCompare(b.at));
  const usual = usualAt(sorted, now);
  const sales: { start: string; last: string; depth: number[] }[] = [];
  sorted.forEach((point, index) => {
    const base = usual[index];
    if (!base || point.price > base * (1 - rules.saleDepth)) return;
    const depth = 1 - point.price / base;
    const current = sales.at(-1);
    if (current && daysBetween(current.last, point.at) <= rules.sameSaleDays) {
      current.last = point.at;
      current.depth.push(depth);
    } else {
      sales.push({ start: point.at, last: point.at, depth: [depth] });
    }
  });
  if (sales.length < rules.minSales) return null;
  const gaps = sales.slice(1).map((sale, index) => daysBetween(sales[index].start, sale.start));
  const every = median(gaps);
  if (every < rules.minCycleDays || every > rules.maxCycleDays) return null;
  if (gaps.some((gap) => Math.abs(gap - every) > every * rules.gapTolerance)) return null;
  const today = dayOf(now.toISOString());
  let next = Date.parse(dayOf(sales.at(-1)!.start)) + every * DAY_MS;
  while (next < Date.parse(today)) next += every * DAY_MS;
  return {
    everyDays: Math.round(every),
    next: new Date(next).toISOString().slice(0, 10),
    depth: median(sales.map((sale) => median(sale.depth))),
    sales: sales.length
  };
}

export type WeekMove = { from: number; to: number; change: number; pct: number };

/** Price now vs about a week ago for one shop. Null when unknown or too small to matter. */
export function weekMove(points: PricePoint[], current: number | null, now = new Date(), rules = WATCH_RULES): WeekMove | null {
  if (current === null) return null;
  const weekAgo = now.getTime() - 7 * DAY_MS;
  const before = points.filter((point) => Date.parse(point.at) <= weekAgo).at(-1);
  if (!before || weekAgo - Date.parse(before.at) > (rules.weekAgoMaxDays - 7) * DAY_MS) return null;
  const change = Math.round((current - before.price) * 100) / 100;
  const pct = before.price > 0 ? change / before.price : 0;
  if (Math.abs(change) < rules.minMoveDollars || Math.abs(pct) < rules.minMovePct) return null;
  return { from: before.price, to: current, change, pct };
}

export type WatchInput = {
  id: string;
  name: string;
  /** The shop the card headlines (cheapest fresh), with its daily lows. */
  shop: string | null;
  url: string | null;
  price: number | null;
  points: PricePoint[];
  allTimeLow: { price: number; at: string } | null;
  /** A shop that was out of stock in the last two weeks and has a price again. */
  backInStock: { shop: string; at: string } | null;
};

export type WatchItem = WatchInput & {
  verdict: Verdict;
  usual: number | null;
  /** Saving vs usual, 0.25 = 25% below. */
  saving: number | null;
  raise: { from: number; to: number } | null;
  isLow: boolean;
  nearLow: boolean;
  cycle: SaleCycle | null;
  week: WeekMove | null;
};

export function judgeItem(input: WatchInput, now = new Date(), rules = WATCH_RULES): WatchItem {
  const usual = computeUsualPrice(input.points, { now });
  const insight = judgeDiscount(input.points, { now, usualPrice: usual.lowConfidence ? null : usual.currentUsual });
  const low = input.allTimeLow;
  const price = input.price;
  return {
    ...input,
    verdict: insight.verdict,
    usual: insight.usualPrice,
    saving: insight.discountVsUsual,
    raise: insight.raise ? { from: insight.raise.from, to: insight.raise.to } : null,
    isLow: Boolean(low && price !== null && price <= low.price),
    nearLow: Boolean(low && price !== null && price <= low.price * (1 + rules.nearLowPct)),
    cycle: saleCycle(input.points, now, rules),
    week: weekMove(input.points, price, now, rules)
  };
}

export type WatchSections = {
  buyNow: WatchItem[];
  wait: WatchItem[];
  notReal: WatchItem[];
  down: WatchItem[];
  up: WatchItem[];
  backInStock: WatchItem[];
};

const onSale = (item: WatchItem) => item.verdict === 'real_discount';

export function watchSections(items: WatchItem[], now = new Date(), rules = WATCH_RULES): WatchSections {
  const today = now.toISOString().slice(0, 10);
  const soon = (item: WatchItem) =>
    Boolean(item.cycle) && daysBetween(today, item.cycle!.next) <= rules.waitWithinDays;
  const byMove = (a: WatchItem, b: WatchItem) => Math.abs(b.week!.pct) - Math.abs(a.week!.pct);
  return {
    buyNow: items
      .filter((item) => item.price !== null && (onSale(item) || (item.isLow && item.verdict !== 'insufficient_data')))
      .toSorted((a, b) => (b.saving ?? 0) - (a.saving ?? 0)),
    wait: items
      .filter((item) => item.price !== null && !onSale(item) && !item.nearLow && soon(item))
      .toSorted((a, b) => a.cycle!.next.localeCompare(b.cycle!.next)),
    notReal: items.filter((item) => item.verdict === 'fake_discount'),
    down: items.filter((item) => item.week && item.week.change < 0).toSorted(byMove),
    up: items.filter((item) => item.week && item.week.change > 0).toSorted(byMove),
    backInStock: items.filter((item) => item.backInStock)
  };
}
