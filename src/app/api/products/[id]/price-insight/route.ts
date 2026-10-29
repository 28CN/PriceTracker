import { NextResponse } from 'next/server';

import { getApiAuth } from '@/lib/auth';
import {
  buildSeries,
  judgeDiscount,
  lowestPriceSeries,
  type PriceInsight,
  type PricePoint
} from '@/lib/priceInsight';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * GET /api/products/:id/price-insight?days=180
 *
 * Read-only price trend + "real discount" verdict for one product, for
 * PriceChart.tsx. Uses the caller's session client, so RLS decides what is
 * visible (own products, plus public watchlists). The demo account can read.
 *
 * 200 -> PriceInsightResponse (below). 401 not signed in, 400 bad id/days,
 * 404 product not visible, 500 database error.
 *
 * `days` (1..365, default 180) limits the chart series only. The verdict
 * always uses the last 90 days, and `allTimeLow`/`stats` use full history.
 */
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;
// PostgREST caps each response (1000 rows by default), so daily rows are paged.
export const PAGE_SIZE = 1000;
/** Hard safety cap on daily rows. Hitting it returns 500, never a truncated result. */
export const MAX_DAILY_ROWS = 20_000;

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json({ error: 'Invalid product id.' }, { status: 400 });
  }
  const rawDays = new URL(request.url).searchParams.get('days');
  const days = rawDays === null ? 180 : Number(rawDays);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return NextResponse.json({ error: 'days must be an integer from 1 to 365.' }, { status: 400 });
  }

  const auth = await getApiAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }
  const db = auth.supabase;

  const { data: product, error: productError } = await db
    .from('products')
    .select('id, name, target_price')
    .eq('id', id)
    .maybeSingle();
  if (productError) return NextResponse.json({ error: 'Could not load product.' }, { status: 500 });
  if (!product) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

  const { data: links, error: linksError } = await db
    .from('tracked_links')
    .select('id, retailer, url, stock_status')
    .eq('product_id', id)
    .order('created_at', { ascending: true });
  if (linksError) return NextResponse.json({ error: 'Could not load links.' }, { status: 500 });

  const linkIds = (links ?? []).map((l) => l.id as string);
  const now = new Date();
  // History for the verdict needs 90 days even when the chart asks for less.
  const historyFrom = new Date(now.getTime() - Math.max(days, 90) * DAY_MS).toISOString();
  const chartFrom = new Date(now.getTime() - days * DAY_MS).toISOString();

  let dailyRows: DailyRow[] = [];
  let statsRows: Array<Record<string, unknown>> = [];
  if (linkIds.length) {
    const [daily, stats] = await Promise.all([
      loadDaily(db, linkIds, historyFrom.slice(0, 10)),
      db.from('price_link_stats').select('*').eq('product_id', id)
    ]);
    if (daily === 'too_many') {
      return NextResponse.json({ error: 'Too much price history to load.' }, { status: 500 });
    }
    if (daily === 'error' || stats.error) {
      return NextResponse.json({ error: 'Could not load price history.' }, { status: 500 });
    }
    dailyRows = daily;
    statsRows = stats.data ?? [];
  }
  const statsByLink = new Map(statsRows.map((s) => [s.link_id as string, s]));

  // One point per link per UTC day: the day's lowest price, stamped with the
  // day's last observation. The link's newest day uses its live current price
  // (from price_link_stats), so the chart ends at the price shown elsewhere.
  const series = buildSeries(
    dailyRows.map((r) => ({ linkId: r.link_id, price: r.min_price, createdAt: r.last_at }))
  );
  for (const s of series) {
    const last = s.points.at(-1);
    const current = num(statsByLink.get(s.linkId)?.current_price);
    const lastSeen = statsByLink.get(s.linkId)?.last_seen_at;
    if (last && current !== null && typeof lastSeen === 'string' && lastSeen.slice(0, 10) === last.at.slice(0, 10)) {
      last.price = current;
      last.at = lastSeen;
    }
  }
  const lowestAll = lowestPriceSeries(series);
  const insight = judgeDiscount(lowestPriceSeries(series, { collapse: false }), { now });

  // All-time low always comes from price_link_stats (full history), never
  // from the windowed rows. No stats -> no all-time low.
  let best: { at: string; price: number } | null = null;
  for (const s of statsRows) {
    const price = num(s.all_time_low);
    if (price === null || typeof s.all_time_low_at !== 'string') continue;
    if (!best || price < best.price) best = { at: s.all_time_low_at, price };
  }
  insight.allTimeLow = best;
  insight.isAllTimeLow = Boolean(best && insight.currentPrice !== null && insight.currentPrice <= best.price);
  insight.reasons = insight.reasons.filter((r) => r !== 'all_time_low');
  if (insight.isAllTimeLow && insight.verdict !== 'insufficient_data') insight.reasons.push('all_time_low');

  const inChart = (p: PricePoint) => p.at >= chartFrom;
  const body: PriceInsightResponse = {
    product: { id: product.id, name: product.name, targetPrice: num(product.target_price) },
    range: { days, from: chartFrom, to: now.toISOString() },
    lowest: lowestAll.filter(inChart),
    links: (links ?? []).map((l) => {
      const s = statsByLink.get(l.id);
      return {
        linkId: l.id,
        retailer: l.retailer,
        url: l.url,
        stockStatus: l.stock_status ?? 'unknown',
        points: (series.find((x) => x.linkId === l.id)?.points ?? []).filter(inChart),
        stats: s
          ? {
              currentPrice: num(s.current_price),
              lastSeenAt: (s.last_seen_at as string) ?? null,
              allTimeLow: num(s.all_time_low),
              allTimeLowAt: (s.all_time_low_at as string) ?? null,
              low30d: num(s.low_30d),
              avg30d: num(s.avg_30d),
              high30d: num(s.high_30d),
              low90d: num(s.low_90d),
              avg90d: num(s.avg_90d),
              high90d: num(s.high_90d),
              sampleCount: Number(s.sample_count ?? 0),
              sampleCount90d: Number(s.sample_count_90d ?? 0),
              lastChangeAt: (s.last_change_at as string) ?? null
            }
          : null
      };
    }),
    insight
  };
  return NextResponse.json(body);
}

type DailyRow = { link_id: string; day: string; min_price: number | string; last_at: string };

type Db = NonNullable<Awaited<ReturnType<typeof getApiAuth>>>['supabase'];

/**
 * Read price_link_daily ascending, one PostgREST page at a time, until a
 * short page. Ordered by (day, link_id), which is unique, so pages are stable.
 * Returns 'too_many' past MAX_DAILY_ROWS instead of silently truncating.
 */
async function loadDaily(db: Db, linkIds: string[], fromDay: string): Promise<DailyRow[] | 'error' | 'too_many'> {
  const rows: DailyRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    if (offset >= MAX_DAILY_ROWS) return 'too_many';
    const { data, error } = await db
      .from('price_link_daily')
      .select('link_id, day, min_price, last_at')
      .in('link_id', linkIds)
      .gte('day', fromDay)
      .order('day', { ascending: true })
      .order('link_id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) return 'error';
    const page = (data ?? []) as DailyRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}
