import { PRICE_FRESH_DAYS } from './priceAge';
import type { StockStatus } from './types';
import { computeUsualPrice, type PriceObservation } from './usualPrice';

const DAY_MS = 86_400_000;
const WEEK_MS = PRICE_FRESH_DAYS * DAY_MS;

export const OVERVIEW_WEEKS = 8;
/** 9 weeks (63 days) so week 0 of the 8-week sparkline has a prior-week baseline. */
export const OVERVIEW_LOOKBACK_DAYS = (OVERVIEW_WEEKS + 1) * PRICE_FRESH_DAYS;
export const OVERVIEW_MAX_ENTRIES = 5;

export type OverviewLink = {
  id: string;
  retailer: string;
  isActive: boolean;
  stockStatus: StockStatus;
};

export type OverviewProduct = {
  id: string;
  name: string;
  targetPrice: number | null;
  links: OverviewLink[];
};

export type OverviewDailyRow = {
  linkId: string;
  day: string;
  minPrice: number;
  lastAt: string;
};

export type OverviewEntry = {
  productId: string;
  linkId: string;
  name: string;
  retailer: string;
  oldPrice: number;
  newPrice: number;
};

export type OverviewUsualRiseEntry = OverviewEntry & {
  at: string;
};

export type OverviewSparklines = {
  /** 8 weekly points: equal-weighted average price index (100 = baseline), or 0 when empty. */
  tracked: number[];
  /** 8 weekly points: count of tracked items at or below Goal each week. */
  belowGoal: number[];
  /** 8 weekly points: count of tracked items whose cheapest price fell vs the previous week. */
  dropped: number[];
};

export type OverviewResponse = {
  trackedCount: number;
  belowGoalCount: number;
  droppedThisWeekCount: number;
  sparklines: OverviewSparklines;
  biggestDrops: OverviewEntry[];
  newlyBelowGoal: OverviewEntry[];
  usualPriceRises: OverviewUsualRiseEntry[];
};

type ParsedObs = {
  ms: number;
  at: string;
  price: number;
};

type WeeklyBest = {
  linkId: string;
  retailer: string;
  price: number;
  ms: number;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseTimestamp(row: OverviewDailyRow): number {
  const fromLast = Date.parse(row.lastAt);
  if (Number.isFinite(fromLast)) return fromLast;
  const fromDay = Date.parse(`${row.day}T12:00:00.000Z`);
  return Number.isFinite(fromDay) ? fromDay : NaN;
}

/**
 * Latest observation for one link inside a weekly bucket.
 * For the current week (weekIndex === OVERVIEW_WEEKS - 1), uses inclusive lower
 * bound [now - 7d, now] to match isStaleCheckedAt freshness semantics.
 */
function latestInBucket(
  observations: ParsedObs[],
  startMs: number,
  endMs: number,
  inclusiveStart: boolean
): ParsedObs | null {
  let latest: ParsedObs | null = null;
  for (const obs of observations) {
    if (obs.ms > endMs) continue;
    if (inclusiveStart ? obs.ms < startMs : obs.ms <= startMs) continue;
    if (!latest || obs.ms >= latest.ms) {
      latest = obs;
    }
  }
  return latest;
}

/**
 * Compute summary strip metrics, 8-week sparklines, and "This week" highlights
 * from the signed-in user's products and ~8–9 weeks of price_link_daily rows.
 * Pure and deterministic (pass `now`).
 */
export function computeOverview(
  products: OverviewProduct[],
  dailyRows: OverviewDailyRow[],
  options: { now?: Date | number; maxPerGroup?: number } = {}
): OverviewResponse {
  const nowMs =
    options.now === undefined
      ? Date.now()
      : options.now instanceof Date
        ? options.now.getTime()
        : options.now;
  const maxPerGroup = options.maxPerGroup ?? OVERVIEW_MAX_ENTRIES;

  if (products.length === 0) {
    return {
      trackedCount: 0,
      belowGoalCount: 0,
      droppedThisWeekCount: 0,
      sparklines: {
        tracked: Array(OVERVIEW_WEEKS).fill(0),
        belowGoal: Array(OVERVIEW_WEEKS).fill(0),
        dropped: Array(OVERVIEW_WEEKS).fill(0)
      },
      biggestDrops: [],
      newlyBelowGoal: [],
      usualPriceRises: []
    };
  }

  // Group valid daily rows by linkId, sorted ascending by timestamp.
  const obsByLink = new Map<string, ParsedObs[]>();
  for (const row of dailyRows) {
    const ms = parseTimestamp(row);
    if (!Number.isFinite(ms) || ms > nowMs) continue;
    if (!Number.isFinite(row.minPrice) || row.minPrice <= 0) continue;
    const list = obsByLink.get(row.linkId);
    const item: ParsedObs = { ms, at: row.lastAt, price: roundMoney(row.minPrice) };
    if (list) list.push(item);
    else obsByLink.set(row.linkId, [item]);
  }
  for (const list of obsByLink.values()) {
    list.sort((a, b) => a.ms - b.ms);
  }

  // Bucket index 0 is the baseline week (9 weeks ago); indices 1..8 are the 8 sparkline weeks.
  // Bucket 8 is "this week" (fresh), bucket 7 is "last week".
  const totalBuckets = OVERVIEW_WEEKS + 1;
  const bucketBounds = Array.from({ length: totalBuckets }, (_, idx) => {
    const weeksBack = totalBuckets - 1 - idx;
    const endMs = nowMs - weeksBack * WEEK_MS;
    const startMs = endMs - WEEK_MS;
    return { startMs, endMs, isCurrent: idx === totalBuckets - 1 };
  });

  const belowGoalSpark = Array<number>(OVERVIEW_WEEKS).fill(0);
  const droppedSpark = Array<number>(OVERVIEW_WEEKS).fill(0);
  const indexSums = Array<number>(OVERVIEW_WEEKS).fill(0);
  const indexCounts = Array<number>(OVERVIEW_WEEKS).fill(0);

  let belowGoalCount = 0;
  let droppedThisWeekCount = 0;

  type ScoredDrop = { entry: OverviewEntry; pctDrop: number; absDrop: number };
  const dropCandidates: ScoredDrop[] = [];
  const newlyBelowCandidates: Array<{ entry: OverviewEntry; pctDrop: number; goalMargin: number }> = [];
  const usualRiseCandidates: Array<{ entry: OverviewUsualRiseEntry; pctRise: number; absRise: number }> = [];

  const prevWeekCutoffMs = nowMs - WEEK_MS;

  for (const product of products) {
    const activeLinks = product.links.filter((link) => link.isActive);
    const weeklyBest: Array<WeeklyBest | null> = Array(totalBuckets).fill(null);

    for (let b = 0; b < totalBuckets; b += 1) {
      const bound = bucketBounds[b];
      let best: WeeklyBest | null = null;
      for (const link of activeLinks) {
        if (bound.isCurrent && link.stockStatus === 'unavailable') continue;
        const obs = obsByLink.get(link.id);
        if (!obs || obs.length === 0) continue;
        const sample = latestInBucket(obs, bound.startMs, bound.endMs, bound.isCurrent);
        if (!sample) continue;
        if (
          !best ||
          sample.price < best.price ||
          (sample.price === best.price && sample.ms > best.ms)
        ) {
          best = {
            linkId: link.id,
            retailer: link.retailer,
            price: sample.price,
            ms: sample.ms
          };
        }
      }
      weeklyBest[b] = best;
    }

    // First observed weekly price in the window anchors this product's price index at 100.
    const firstPrice = weeklyBest.find((w) => w !== null)?.price ?? null;

    for (let w = 0; w < OVERVIEW_WEEKS; w += 1) {
      const b = w + 1;
      const curr = weeklyBest[b];
      const prev = weeklyBest[b - 1];

      if (curr && firstPrice && firstPrice > 0) {
        indexSums[w] += (curr.price / firstPrice) * 100;
        indexCounts[w] += 1;
      }

      if (curr && product.targetPrice !== null && curr.price <= product.targetPrice) {
        belowGoalSpark[w] += 1;
      }

      if (curr && prev && prev.price - curr.price >= 0.01) {
        droppedSpark[w] += 1;
      }
    }

    const thisWeek = weeklyBest[totalBuckets - 1];
    const lastWeek = weeklyBest[totalBuckets - 2];

    if (thisWeek && product.targetPrice !== null && thisWeek.price <= product.targetPrice) {
      belowGoalCount += 1;
      if (lastWeek && lastWeek.price > product.targetPrice) {
        const pctDrop = lastWeek.price > 0 ? (lastWeek.price - thisWeek.price) / lastWeek.price : 0;
        newlyBelowCandidates.push({
          entry: {
            productId: product.id,
            linkId: thisWeek.linkId,
            name: product.name,
            retailer: thisWeek.retailer,
            oldPrice: lastWeek.price,
            newPrice: thisWeek.price
          },
          pctDrop,
          goalMargin: product.targetPrice - thisWeek.price
        });
      }
    }

    if (thisWeek && lastWeek && lastWeek.price - thisWeek.price >= 0.01) {
      droppedThisWeekCount += 1;
      const absDrop = roundMoney(lastWeek.price - thisWeek.price);
      const pctDrop = lastWeek.price > 0 ? absDrop / lastWeek.price : 0;
      dropCandidates.push({
        entry: {
          productId: product.id,
          linkId: thisWeek.linkId,
          name: product.name,
          retailer: thisWeek.retailer,
          oldPrice: lastWeek.price,
          newPrice: thisWeek.price
        },
        pctDrop,
        absDrop
      });
    }

    // Usual price rises confirmed this week (using src/lib/usualPrice.ts per shop).
    let bestRise: { entry: OverviewUsualRiseEntry; pctRise: number; absRise: number } | null = null;
    for (const link of activeLinks) {
      const obs = obsByLink.get(link.id);
      if (!obs || obs.length < 3) continue;

      const allObs: PriceObservation[] = obs.map((o) => ({ at: o.at, price: o.price }));
      const beforeObs: PriceObservation[] = obs
        .filter((o) => o.ms <= prevWeekCutoffMs)
        .map((o) => ({ at: o.at, price: o.price }));

      const nowUsual = computeUsualPrice(allObs, { now: nowMs });
      if (nowUsual.lowConfidence || nowUsual.shifts.length === 0) continue;

      const latestShift = nowUsual.shifts[nowUsual.shifts.length - 1];
      if (latestShift.direction !== 'up') continue;
      if (nowUsual.currentUsual !== latestShift.to) continue;

      const prevUsual = computeUsualPrice(beforeObs, { now: prevWeekCutoffMs });
      const alreadyConfirmed = prevUsual.shifts.some(
        (s) => s.direction === 'up' && s.at === latestShift.at && s.to === latestShift.to
      );
      if (alreadyConfirmed) continue;

      const absRise = roundMoney(latestShift.to - latestShift.from);
      if (absRise < 0.01) continue;
      const pctRise = latestShift.from > 0 ? absRise / latestShift.from : 0;

      if (
        !bestRise ||
        pctRise > bestRise.pctRise ||
        (pctRise === bestRise.pctRise && absRise > bestRise.absRise)
      ) {
        bestRise = {
          entry: {
            productId: product.id,
            linkId: link.id,
            name: product.name,
            retailer: link.retailer,
            oldPrice: latestShift.from,
            newPrice: latestShift.to,
            at: latestShift.at
          },
          pctRise,
          absRise
        };
      }
    }

    if (bestRise) {
      usualRiseCandidates.push(bestRise);
    }
  }

  // Build 8-point price index sparkline (carry last known value across quiet weeks).
  const trackedSpark: number[] = [];
  let lastIndex = 0;
  for (let w = 0; w < OVERVIEW_WEEKS; w += 1) {
    if (indexCounts[w] > 0) {
      lastIndex = Math.round((indexSums[w] / indexCounts[w]) * 10) / 10;
    }
    trackedSpark.push(lastIndex);
  }

  dropCandidates.sort(
    (a, b) =>
      b.pctDrop - a.pctDrop ||
      b.absDrop - a.absDrop ||
      a.entry.name.localeCompare(b.entry.name)
  );

  newlyBelowCandidates.sort(
    (a, b) =>
      b.pctDrop - a.pctDrop ||
      b.goalMargin - a.goalMargin ||
      a.entry.name.localeCompare(b.entry.name)
  );

  usualRiseCandidates.sort(
    (a, b) =>
      b.pctRise - a.pctRise ||
      b.absRise - a.absRise ||
      a.entry.name.localeCompare(b.entry.name)
  );

  return {
    trackedCount: products.length,
    belowGoalCount,
    droppedThisWeekCount,
    sparklines: {
      tracked: trackedSpark,
      belowGoal: belowGoalSpark,
      dropped: droppedSpark
    },
    biggestDrops: dropCandidates.slice(0, maxPerGroup).map((c) => c.entry),
    newlyBelowGoal: newlyBelowCandidates.slice(0, maxPerGroup).map((c) => c.entry),
    usualPriceRises: usualRiseCandidates.slice(0, maxPerGroup).map((c) => c.entry)
  };
}
