/**
 * Shared response types for GET /api/products/:id/price-insight.
 * Import from here in frontend code (type-only; no server code pulled in).
 */
import type { PriceInsight, PricePoint } from './priceInsight';
import type { PromoCoverage, PromoCycle, PromoPeriod } from './promoPeriods';

export type { IsoWeekday, PromoCoverage, PromoCycle, PromoPeriod } from './promoPeriods';
export type { PriceInsight, PricePoint } from './priceInsight';

export type PriceInsightResponse = {
  product: { id: string; name: string; targetPrice: number | null };
  range: { days: number; from: string; to: string };
  /** Lowest current price across links over time, ascending; for the main line. */
  lowest: PricePoint[];
  /** One series per tracked link, ascending; for per-retailer lines. */
  links: Array<{
    linkId: string;
    retailer: string;
    url: string;
    stockStatus: string;
    points: PricePoint[];
    stats: LinkStats | null;
    /** v1.1: retailer promo cycle used for `periods`. */
    promo: PromoCycle;
    /** v1.1: promo periods over the chart range, oldest first. */
    periods: PromoPeriod[];
    /** v1.1: how many of `periods` had at least one scrape. */
    coverage: PromoCoverage;
  }>;
  insight: PriceInsight;
};

export type LinkStats = {
  currentPrice: number | null;
  lastSeenAt: string | null;
  allTimeLow: number | null;
  allTimeLowAt: string | null;
  low30d: number | null;
  avg30d: number | null;
  high30d: number | null;
  low90d: number | null;
  avg90d: number | null;
  high90d: number | null;
  sampleCount: number;
  sampleCount90d: number;
  lastChangeAt: string | null;
};
