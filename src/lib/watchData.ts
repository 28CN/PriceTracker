import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveCardPrice } from '@/lib/cardState';
import { MAX_DAILY_ROWS, PAGE_SIZE, type PricePoint } from '@/lib/priceInsight';
import { fetchProducts } from '@/lib/queries';
import type { ProductView } from '@/lib/types';
import { judgeItem, watchSections, type WatchItem, type WatchSections } from '@/lib/watch';

const DAY_MS = 86_400_000;
const HISTORY_DAYS = 180;
const BACK_IN_STOCK_DAYS = 14;

type DailyRow = { link_id: string; day: string; min_price: number | string; last_at: string };
type StatsRow = { link_id: string; all_time_low: number | string | null; all_time_low_at: string | null };

async function loadDaily(db: SupabaseClient, linkIds: string[], fromDay: string): Promise<DailyRow[]> {
  const rows: DailyRow[] = [];
  for (let offset = 0; offset < MAX_DAILY_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await db
      .from('price_link_daily')
      .select('link_id, day, min_price, last_at')
      .in('link_id', linkIds)
      .gte('day', fromDay)
      .order('day', { ascending: true })
      .order('link_id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error('Could not load price history.');
    const page = (data ?? []) as DailyRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

export type WatchView = { products: ProductView[]; items: WatchItem[]; sections: WatchSections };

/** Everything the Price watch page needs for one person, read-only. */
export async function loadWatch(db: SupabaseClient, userId: string, now = new Date()): Promise<WatchView> {
  const products = await fetchProducts(db, userId);
  const linkIds = products.flatMap((product) => product.links.map((link) => link.id));
  if (linkIds.length === 0) return { products, items: [], sections: watchSections([], now) };

  const fromDay = new Date(now.getTime() - HISTORY_DAYS * DAY_MS).toISOString().slice(0, 10);
  const since = new Date(now.getTime() - BACK_IN_STOCK_DAYS * DAY_MS).toISOString();
  const [daily, stats, outOfStock] = await Promise.all([
    loadDaily(db, linkIds, fromDay),
    db.from('price_link_stats').select('link_id, all_time_low, all_time_low_at').in('link_id', linkIds),
    db
      .from('crawl_events')
      .select('link_id, created_at')
      .in('link_id', linkIds)
      .ilike('message', '%currently unavailable%')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500)
  ]);

  const pointsByLink = new Map<string, PricePoint[]>();
  for (const row of daily) {
    const list = pointsByLink.get(row.link_id) ?? [];
    list.push({ at: row.last_at, price: Number(row.min_price) });
    pointsByLink.set(row.link_id, list);
  }
  const statsByLink = new Map(((stats.data ?? []) as StatsRow[]).map((row) => [row.link_id, row]));
  const lastOutOfStock = new Map<string, string>();
  for (const row of (outOfStock.data ?? []) as { link_id: string; created_at: string }[]) {
    if (!lastOutOfStock.has(row.link_id)) lastOutOfStock.set(row.link_id, row.created_at);
  }

  const items = products.map((product) => {
    const head = resolveCardPrice({ links: product.links }).headlineLink ?? null;
    let low: { price: number; at: string } | null = null;
    for (const link of product.links) {
      const row = statsByLink.get(link.id);
      const price = row?.all_time_low === null || row?.all_time_low === undefined ? null : Number(row.all_time_low);
      if (price !== null && row?.all_time_low_at && (!low || price < low.price)) low = { price, at: row.all_time_low_at };
    }
    const back = product.links.find((link) => {
      const out = lastOutOfStock.get(link.id);
      return (
        out && link.stockStatus === 'in_stock' && link.latestPrice !== null && !link.priceStale && (link.latestAt ?? '') > out
      );
    });
    const price = head && !head.priceStale && head.stockStatus !== 'unavailable' ? head.latestPrice : null;
    // End the series at the price the card shows (the day's low can differ).
    const points = head ? [...(pointsByLink.get(head.id) ?? [])] : [];
    if (price !== null && head?.latestAt) {
      const last = points.at(-1);
      if (last && last.at.slice(0, 10) === head.latestAt.slice(0, 10)) points[points.length - 1] = { at: head.latestAt, price };
      else if (!last || last.at < head.latestAt) points.push({ at: head.latestAt, price });
    }
    return judgeItem(
      {
        id: product.id,
        name: product.name,
        shop: head?.retailer ?? null,
        url: head?.url ?? null,
        price,
        points,
        allTimeLow: low,
        backInStock: back ? { shop: back.retailer, at: back.latestAt ?? now.toISOString() } : null
      },
      now
    );
  });
  return { products, items, sections: watchSections(items, now) };
}
