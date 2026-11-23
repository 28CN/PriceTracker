import { NextResponse } from 'next/server';

import { getApiAuth } from '@/lib/auth';
import { toNumber } from '@/lib/format';
import {
  computeOverview,
  OVERVIEW_LOOKBACK_DAYS,
  type OverviewDailyRow,
  type OverviewProduct
} from '@/lib/overview';
import { MAX_DAILY_ROWS, PAGE_SIZE } from '@/lib/priceInsight';
import type { StockStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const DAY_MS = 86_400_000;

type RawProduct = {
  id: string;
  name: string;
  target_price: number | string | null;
};

type RawLink = {
  id: string;
  product_id: string;
  retailer: string | null;
  is_active: boolean | null;
  stock_status?: string | null;
};

type DailyRow = {
  link_id: string;
  day: string;
  min_price: number | string;
  last_at: string;
};

type Db = NonNullable<Awaited<ReturnType<typeof getApiAuth>>>['supabase'];

function parseStockStatus(value: string | null | undefined): StockStatus {
  if (value === 'unavailable' || value === 'in_stock') return value;
  return 'unknown';
}

async function loadDaily(
  db: Db,
  linkIds: string[],
  fromDay: string
): Promise<DailyRow[] | 'error' | 'too_many'> {
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

/**
 * GET /api/overview
 *
 * Non-blocking dashboard summary: 8-week sparklines, weekly drop count,
 * and "This week" highlights (Biggest drops, Newly below Goal, Usual price went up).
 * Uses the caller's session client so RLS applies, scoped to the caller's own products.
 */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }
  const db = auth.supabase;

  const { data: rawProducts, error: productsError } = await db
    .from('products')
    .select('id, name, target_price')
    .eq('owner_id', auth.userId)
    .order('name', { ascending: true });

  if (productsError) {
    return NextResponse.json({ error: 'Could not load overview.' }, { status: 500 });
  }

  const productList = (rawProducts ?? []) as RawProduct[];
  if (productList.length === 0) {
    return NextResponse.json(computeOverview([], []), {
      headers: { 'Cache-Control': 'private, max-age=60' }
    });
  }

  const productIds = productList.map((p) => p.id);
  const { data: rawLinks, error: linksError } = await db
    .from('tracked_links')
    .select('id, product_id, retailer, is_active, stock_status')
    .in('product_id', productIds);

  if (linksError) {
    return NextResponse.json({ error: 'Could not load links.' }, { status: 500 });
  }

  const linksByProduct = new Map<string, RawLink[]>();
  const linkIds: string[] = [];
  for (const link of (rawLinks ?? []) as RawLink[]) {
    if (link.is_active !== false) {
      linkIds.push(link.id);
    }
    const bucket = linksByProduct.get(link.product_id);
    if (bucket) bucket.push(link);
    else linksByProduct.set(link.product_id, [link]);
  }

  const now = new Date();
  const fromDay = new Date(now.getTime() - OVERVIEW_LOOKBACK_DAYS * DAY_MS).toISOString().slice(0, 10);

  let dailyRows: DailyRow[] = [];
  if (linkIds.length > 0) {
    const loaded = await loadDaily(db, linkIds, fromDay);
    if (loaded === 'too_many') {
      return NextResponse.json({ error: 'Too much price history to load.' }, { status: 500 });
    }
    if (loaded === 'error') {
      return NextResponse.json({ error: 'Could not load price history.' }, { status: 500 });
    }
    dailyRows = loaded;
  }

  const overviewProducts: OverviewProduct[] = productList.map((p) => ({
    id: p.id,
    name: p.name,
    targetPrice: toNumber(p.target_price),
    links: (linksByProduct.get(p.id) ?? []).map((l) => ({
      id: l.id,
      retailer: l.retailer || 'Unknown shop',
      isActive: l.is_active !== false,
      stockStatus: parseStockStatus(l.stock_status)
    }))
  }));

  const overviewDaily: OverviewDailyRow[] = [];
  for (const r of dailyRows) {
    const minPrice = toNumber(r.min_price);
    if (minPrice === null) continue;
    overviewDaily.push({
      linkId: r.link_id,
      day: r.day,
      minPrice,
      lastAt: r.last_at
    });
  }

  const body = computeOverview(overviewProducts, overviewDaily, { now });
  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'private, max-age=60' }
  });
}
