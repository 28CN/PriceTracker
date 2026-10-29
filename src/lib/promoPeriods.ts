/**
 * Split raw price observations into retailer promo periods (v1.1).
 * Pure: no Next/Supabase imports. Uses Intl for time zones, so DST is handled
 * by the platform's tz database; periods are built on the local calendar.
 */

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type PromoCycle = {
  retailer: string;
  timezone: string;
  anchorWeekday: IsoWeekday;
  cycleDays: number;
  /** True when the retailer had no row in retailer_promo_cycles. */
  isDefault: boolean;
};

export type PromoPeriod = {
  /** Inclusive local-midnight start, ISO with offset, e.g. 2026-10-28T00:00:00+11:00. */
  start: string;
  /** Exclusive end (= next period's start), ISO with offset. */
  end: string;
  /** Lowest observed price in [start, end), or null when there was no scrape. */
  minPrice: number | null;
  /** True when at least one scrape landed in the period. */
  observed: boolean;
};

export type PromoCoverage = { observed: number; total: number; ratio: number };

export type CycleRow = { retailer: string; anchor_weekday: number; cycle_days: number; timezone: string };

export const DEFAULT_PROMO = { anchorWeekday: 3 as IsoWeekday, cycleDays: 7, timezone: 'Australia/Sydney' };

export const normalizeRetailer = (name: string) => name.trim().toLowerCase();

/** Cycle for a retailer name (case/space-insensitive), falling back to the default. */
export function resolveCycle(retailer: string, rows: CycleRow[]): PromoCycle {
  const key = normalizeRetailer(retailer);
  const row = rows.find((r) => normalizeRetailer(r.retailer) === key);
  if (!row) return { retailer, ...DEFAULT_PROMO, isDefault: true };
  return {
    retailer,
    timezone: row.timezone,
    anchorWeekday: row.anchor_weekday as IsoWeekday,
    cycleDays: row.cycle_days,
    isDefault: false
  };
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Local wall-clock parts of an instant in tz. */
function localParts(ms: number, tz: string) {
  const p: Record<string, number> = {};
  for (const { type, value } of fmt(tz).formatToParts(new Date(ms))) {
    if (type !== 'literal') p[type] = Number(value);
  }
  return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}

/** Offset of tz from UTC at an instant, in minutes (e.g. +660 for AEDT). */
export function offsetMinutes(ms: number, tz: string): number {
  const l = localParts(ms, tz);
  const asUtc = Date.UTC(l.y, l.m - 1, l.d, l.h, l.mi, l.s);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

/** UTC instant of local midnight on a local calendar date (dayNumber = days since 1970-01-01). */
function localMidnight(dayNumber: number, tz: string): number {
  const wall = dayNumber * 86_400_000;
  let ms = wall - offsetMinutes(wall, tz) * 60_000;
  ms = wall - offsetMinutes(ms, tz) * 60_000; // refine across a DST edge
  return ms;
}

const localDayNumber = (ms: number, tz: string) => {
  const l = localParts(ms, tz);
  return Math.floor(Date.UTC(l.y, l.m - 1, l.d) / 86_400_000);
};

/** ISO string with the tz offset at that instant, e.g. 2026-10-28T00:00:00+11:00. */
export function isoWithOffset(ms: number, tz: string): string {
  const l = localParts(ms, tz);
  const off = offsetMinutes(ms, tz);
  const sign = off < 0 ? '-' : '+';
  const a = Math.abs(off);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${l.y}-${p2(l.m)}-${p2(l.d)}T${p2(l.h)}:${p2(l.mi)}:${p2(l.s)}${sign}${p2(Math.floor(a / 60))}:${p2(a % 60)}`;
}

// 1970-01-01 was a Thursday (ISO 4). Day numbers whose weekday is the anchor
// form the period grid; 14-day cycles are aligned to this fixed epoch.
const isoWeekdayOf = (dayNumber: number) => ((((dayNumber + 3) % 7) + 7) % 7) + 1;

function periodStartDay(dayNumber: number, cycle: PromoCycle): number {
  const back = (isoWeekdayOf(dayNumber) - cycle.anchorWeekday + 7) % 7;
  let start = dayNumber - back;
  if (cycle.cycleDays !== 7) {
    // First anchor day on/after epoch, then align to the cycle length.
    const ref = (cycle.anchorWeekday - 4 + 7) % 7;
    const k = Math.floor((start - ref) / cycle.cycleDays);
    start = ref + k * cycle.cycleDays;
  }
  return start;
}

export type Observation = { at: string; price: number };

/**
 * Periods covering [fromIso, toIso] in the retailer's local time, oldest first.
 * The first period is the one containing `from`; the last contains `to`.
 */
export function buildPromoPeriods(
  observations: Observation[],
  cycle: PromoCycle,
  fromIso: string,
  toIso: string
): { periods: PromoPeriod[]; coverage: PromoCoverage } {
  const tz = cycle.timezone;
  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(toIso);
  const obs = observations
    .map((o) => ({ ms: Date.parse(o.at), price: Number(o.price) }))
    .filter((o) => Number.isFinite(o.ms) && Number.isFinite(o.price))
    .sort((a, b) => a.ms - b.ms);

  const periods: PromoPeriod[] = [];
  let day = periodStartDay(localDayNumber(fromMs, tz), cycle);
  let i = 0;
  for (let guard = 0; guard < 1000; guard++) {
    const startMs = localMidnight(day, tz);
    if (startMs > toMs) break;
    const endMs = localMidnight(day + cycle.cycleDays, tz);
    while (i < obs.length && obs[i].ms < startMs) i++;
    let min: number | null = null;
    let j = i;
    while (j < obs.length && obs[j].ms < endMs) {
      if (min === null || obs[j].price < min) min = obs[j].price;
      j++;
    }
    periods.push({ start: isoWithOffset(startMs, tz), end: isoWithOffset(endMs, tz), minPrice: min, observed: min !== null });
    i = j;
    day += cycle.cycleDays;
  }
  const observed = periods.filter((p) => p.observed).length;
  const total = periods.length;
  return { periods, coverage: { observed, total, ratio: total ? Math.round((observed / total) * 1000) / 1000 : 0 } };
}
