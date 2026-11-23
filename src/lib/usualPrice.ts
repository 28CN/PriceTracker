/**
 * Per-shop "usual price" estimator with asymmetric level-shift detection.
 * Pure, dependency-free, deterministic (pass `now`).
 *
 * Rule summary:
 * - Collapse raw observations to one check per Sydney calendar day
 *   (Australia/Sydney, latest price that day) so repeated same-day crawls
 *   cannot look like multi-week holds.
 * - Sparse data (< minObservations): usual price = latest price, no shifts,
 *   flagged lowConfidence.
 * - Baseline: most common price (mode; ties pick the higher non-sale price)
 *   over roughly 8 weeks (baselineWindowDays), falling back to median when no
 *   price repeats. When a sustained initial level exists at the start of the
 *   series, that anchors the start so subsequent level shifts are preserved.
 * - Asymmetric level shifts (with a small schedule-jitter allowance):
 *   - Upward shift: a higher price that holds for at least `minShiftChecks`
 *     consecutive checks spanning at least `minShiftSpanDays` becomes the new
 *     usual price from the date it first appeared.
 *   - Downward shift: stricter because lower prices are usually promotions
 *     (1–2 week specials, sometimes up to 4 weeks). A lower price — whether a
 *     fresh price cut or a revert after an earlier rise — becomes the new usual
 *     price only after holding for at least `minDownShiftChecks` consecutive
 *     checks spanning at least `minDownShiftSpanDays`, dated to its first day.
 * - Short dips (1–2 week specials) stay deals and do not move the usual price.
 * - A brief rise that reverts causes no shift; a held rise that later holds
 *   back at the old price for 4+ weeks records a downward shift on the revert date.
 */

export type PriceObservation = {
  at: string;
  price: number;
};

export type UsualPriceStep = {
  from: string;
  price: number;
};

export type UsualPriceShift = {
  at: string;
  from: number;
  to: number;
  direction: 'up' | 'down';
};

export type UsualPriceResult = {
  series: UsualPriceStep[];
  currentUsual: number | null;
  shifts: UsualPriceShift[];
  lowConfidence: boolean;
};

export const USUAL_PRICE_RULES = {
  /** Fewer Sydney-day observations than this -> low confidence, usual = latest price, no shifts. */
  minObservations: 3,
  /** Lookback window (~8 weeks) used for mode/median baseline calculation. */
  baselineWindowDays: 56,
  /** Minimum consecutive Sydney-day checks at a higher price to confirm an upward level shift. */
  minShiftChecks: 2,
  /**
   * Minimum span in days between first and last check of a higher price level
   * (covers two separate weekly sale cycles / ~2 weeks of shelf time).
   */
  minShiftSpanDays: 7,
  /** Minimum consecutive Sydney-day checks at a lower price to confirm a downward level shift. */
  minDownShiftChecks: 3,
  /**
   * Minimum span in days between first and last check of a lower price level
   * (stricter than rises so 1–2 week specials do not pull down the usual price).
   */
  minDownShiftSpanDays: 28,
  /** Schedule-jitter allowance in hours so a weekly cron running slightly early still confirms. */
  shiftSpanJitterHours: 12
} as const;

export type UsualPriceRules = typeof USUAL_PRICE_RULES;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const sydneyDayFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Australia/Sydney'
});

type DailyCheck = {
  at: string;
  ms: number;
  price: number;
  cents: number;
};

function toCents(price: number): number {
  return Math.round(price * 100);
}

function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

function medianValue(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
}

/**
 * Most common price (ties -> higher, since shelf price is the non-sale price).
 * Falls back to median when no price repeats.
 */
function modeOrMedian(checks: DailyCheck[]): number | null {
  if (checks.length === 0) return null;
  const counts = new Map<number, number>();
  for (const c of checks) {
    counts.set(c.cents, (counts.get(c.cents) ?? 0) + 1);
  }
  let maxCount = 0;
  let bestCents = -Infinity;
  for (const [cents, count] of counts.entries()) {
    if (count > maxCount || (count === maxCount && cents > bestCents)) {
      maxCount = count;
      bestCents = cents;
    }
  }
  if (maxCount >= 2) return fromCents(bestCents);
  return medianValue(checks.map((c) => c.price));
}

function spanMsWithJitter(days: number, jitterHours: number): number {
  return Math.max(0, days * DAY_MS - jitterHours * HOUR_MS);
}

/** Collapse valid observations to the latest check per Sydney calendar day, sorted ascending. */
function toDailyChecks(observations: PriceObservation[]): DailyCheck[] {
  const valid = observations
    .map((o) => ({ at: o.at, ms: Date.parse(o.at), price: o.price }))
    .filter((o) => Number.isFinite(o.ms) && Number.isFinite(o.price) && o.price > 0)
    .sort((a, b) => a.ms - b.ms);

  const byDay = new Map<string, DailyCheck>();
  for (const o of valid) {
    const dayKey = sydneyDayFormatter.format(new Date(o.ms));
    byDay.set(dayKey, {
      at: o.at,
      ms: o.ms,
      price: o.price,
      cents: toCents(o.price)
    });
  }
  return [...byDay.values()];
}

/**
 * Find the highest-frequency sustained price inside a prefix (when a 1-week dip
 * interrupted the initial shelf price before a later shift).
 */
function sustainedPrefixMode(prefix: DailyCheck[], rules: UsualPriceRules, spanThreshold: number): number | null {
  const byPrice = new Map<number, { count: number; firstMs: number; lastMs: number }>();
  for (const c of prefix) {
    const entry = byPrice.get(c.cents);
    if (!entry) {
      byPrice.set(c.cents, { count: 1, firstMs: c.ms, lastMs: c.ms });
    } else {
      entry.count += 1;
      entry.lastMs = c.ms;
    }
  }
  let bestCount = 0;
  let bestCents = -Infinity;
  for (const [cents, info] of byPrice.entries()) {
    if (info.count < rules.minShiftChecks) continue;
    if (info.lastMs - info.firstMs < spanThreshold) continue;
    if (info.count > bestCount || (info.count === bestCount && cents > bestCents)) {
      bestCount = info.count;
      bestCents = cents;
    }
  }
  return bestCount > 0 ? fromCents(bestCents) : null;
}

/**
 * Pick the initial baseline so level shifts across the history are detected
 * cleanly while ignoring a single-week sale at the start of tracking.
 */
function resolveInitialBaseline(
  checks: DailyCheck[],
  nowMs: number,
  rules: UsualPriceRules
): number {
  const windowMs = rules.baselineWindowDays * DAY_MS;
  const upSpanThreshold = spanMsWithJitter(rules.minShiftSpanDays, rules.shiftSpanJitterHours);
  const firstWindowEnd = checks[0].ms + windowMs;

  // Scan for the first consecutive run that satisfies the shift-hold threshold
  // within the initial 8-week window.
  let runStart = 0;
  for (let i = 1; i <= checks.length; i += 1) {
    const same = i < checks.length && checks[i].cents === checks[runStart].cents;
    if (!same) {
      const runEnd = i - 1;
      const runLen = runEnd - runStart + 1;
      const runSpan = checks[runEnd].ms - checks[runStart].ms;
      if (checks[runStart].ms <= firstWindowEnd && runLen >= rules.minShiftChecks && runSpan >= upSpanThreshold) {
        const prefixBaseline = sustainedPrefixMode(checks.slice(0, runStart), rules, upSpanThreshold);
        return prefixBaseline ?? checks[runStart].price;
      }
      runStart = i;
    }
  }

  // No consecutive sustained run in the initial window: use 8-week mode/median
  // anchored to `now` (falling back to the latest observation if older than 8 weeks).
  const recentWindow = checks.filter((c) => c.ms >= nowMs - windowMs && c.ms <= nowMs);
  if (recentWindow.length > 0) {
    return modeOrMedian(recentWindow) ?? checks[checks.length - 1].price;
  }
  const latestMs = checks[checks.length - 1].ms;
  const tailWindow = checks.filter((c) => c.ms >= latestMs - windowMs);
  return modeOrMedian(tailWindow) ?? checks[checks.length - 1].price;
}

/** Compute the usual-price step series, current usual price, and level shifts for one shop. */
export function computeUsualPrice(
  observations: PriceObservation[],
  options: { now?: Date | number; rules?: UsualPriceRules } = {}
): UsualPriceResult {
  const rules = options.rules ?? USUAL_PRICE_RULES;
  const nowMs =
    options.now === undefined
      ? Date.now()
      : options.now instanceof Date
        ? options.now.getTime()
        : options.now;

  const checks = toDailyChecks(observations);
  if (checks.length === 0) {
    return { series: [], currentUsual: null, shifts: [], lowConfidence: true };
  }

  if (checks.length < rules.minObservations) {
    const latest = checks[checks.length - 1];
    return {
      series: [{ from: checks[0].at, price: latest.price }],
      currentUsual: latest.price,
      shifts: [],
      lowConfidence: true
    };
  }

  let currentUsual = resolveInitialBaseline(checks, nowMs, rules);
  let currentCents = toCents(currentUsual);
  const series: UsualPriceStep[] = [{ from: checks[0].at, price: currentUsual }];
  const shifts: UsualPriceShift[] = [];
  const upSpanThreshold = spanMsWithJitter(rules.minShiftSpanDays, rules.shiftSpanJitterHours);
  const downSpanThreshold = spanMsWithJitter(rules.minDownShiftSpanDays, rules.shiftSpanJitterHours);

  let candidate: { price: number; cents: number; startAt: string; startMs: number; count: number } | null = null;

  for (const check of checks) {
    if (check.cents === currentCents) {
      candidate = null;
      continue;
    }

    if (!candidate || candidate.cents !== check.cents) {
      candidate = {
        price: check.price,
        cents: check.cents,
        startAt: check.at,
        startMs: check.ms,
        count: 1
      };
      continue;
    }

    candidate.count += 1;
    const isUp = candidate.cents > currentCents;
    const requiredChecks = isUp ? rules.minShiftChecks : rules.minDownShiftChecks;
    const requiredSpan = isUp ? upSpanThreshold : downSpanThreshold;
    const span = check.ms - candidate.startMs;

    if (candidate.count >= requiredChecks && span >= requiredSpan) {
      const from = currentUsual;
      const to = candidate.price;
      shifts.push({
        at: candidate.startAt,
        from,
        to,
        direction: isUp ? 'up' : 'down'
      });
      series.push({ from: candidate.startAt, price: to });
      currentUsual = to;
      currentCents = candidate.cents;
      candidate = null;
    }
  }

  return {
    series,
    currentUsual,
    shifts,
    lowConfidence: false
  };
}
