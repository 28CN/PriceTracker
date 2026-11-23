import type { SupabaseClient } from '@supabase/supabase-js';

import { toNumber } from './format';
import { isStaleCheckedAt } from './priceAge';
import { getReadClient } from './supabase';
import type { CategoryView, LinkView, ProductView } from './types';

type RawProduct = {
  id: string;
  name: string;
  target_price: number | string | null;
  category_id: string | null;
  image_url?: string | null;
  categories: { id: string; name: string } | { id: string; name: string }[] | null;
};

type RawLink = {
  id: string;
  product_id: string;
  retailer: string | null;
  url: string | null;
  is_active: boolean | null;
  stock_status?: string | null;
  stock_checked_at?: string | null;
  image_url?: string | null;
  image_candidates?: unknown;
  created_at?: string | null;
};

type RawPrice = {
  link_id: string;
  price: number | string | null;
  created_at: string;
};

// Newest readings come back first, so this cap only ever trims stale history.
const PRICE_HISTORY_SCAN_LIMIT = 2000;

function categoryName(value: RawProduct['categories']): string | null {
  if (!value) return null;
  const record = Array.isArray(value) ? value[0] : value;
  return record?.name ?? null;
}

const LINK_SELECTS = [
  'id, product_id, retailer, url, is_active, stock_status, stock_checked_at, image_url, image_candidates, created_at',
  'id, product_id, retailer, url, is_active, stock_status, stock_checked_at, image_url, created_at',
  // Older databases may still lack stock columns; keep the product photo.
  'id, product_id, retailer, url, is_active, image_url, image_candidates, created_at',
  'id, product_id, retailer, url, is_active, image_url, created_at',
  'id, product_id, retailer, url, is_active, image_url',
  'id, product_id, retailer, url, is_active'
] as const;

const PRODUCT_SELECTS = [
  'id, name, target_price, category_id, image_url, categories(id, name)',
  'id, name, target_price, category_id, categories(id, name)'
] as const;

function isMissingColumn(message: string): boolean {
  return /does not exist|42703/.test(message);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function collectLinksByProduct(
  byProduct: Map<string, RawLink[]>,
  rows: RawLink[]
): void {
  for (const link of rows) {
    const bucket = byProduct.get(link.product_id);
    if (bucket) {
      bucket.push(link);
    } else {
      byProduct.set(link.product_id, [link]);
    }
  }
}

async function fetchLinks(
  supabase: SupabaseClient,
  productIds: string[]
): Promise<Map<string, RawLink[]>> {
  const byProduct = new Map<string, RawLink[]>();
  let lastError: string | null = null;

  for (const columns of LINK_SELECTS) {
    const { data, error } = await supabase
      .from('tracked_links')
      .select(columns)
      .in('product_id', productIds);

    if (!error) {
      collectLinksByProduct(byProduct, (data || []) as unknown as RawLink[]);
      return byProduct;
    }

    lastError = error.message;
    // Only fall through when a requested column is missing; other errors stop here.
    if (!isMissingColumn(error.message)) {
      console.error('[queries] could not read tracked_links:', error.message);
      return byProduct;
    }
  }

  if (lastError) {
    console.error('[queries] could not read tracked_links:', lastError);
  }
  return byProduct;
}

// Open crawl jobs older than this are ignored so a stuck job does not
// say "Checking soon" forever. Crawls are asked for by the hour, not the month.
const OPEN_CHECK_MS = 36 * 60 * 60 * 1000;

async function fetchLatestPrices(
  supabase: SupabaseClient,
  linkIds: string[]
): Promise<Map<string, RawPrice>> {
  const latest = new Map<string, RawPrice>();

  if (linkIds.length === 0) {
    return latest;
  }

  // One indexed read of the newest row per link. Falls back to a bounded scan
  // if the migration is not applied yet. Neither path deletes history.
  const viaRpc = await supabase.rpc('latest_link_prices', { link_ids: linkIds });
  if (!viaRpc.error) {
    for (const row of (viaRpc.data || []) as RawPrice[]) {
      if (!latest.has(row.link_id)) latest.set(row.link_id, row);
    }
    return latest;
  }
  if (!/latest_link_prices|does not exist|42883|PGRST202/i.test(viaRpc.error.message)) {
    console.error('[queries] could not read latest prices:', viaRpc.error.message);
  }

  const { data, error } = await supabase
    .from('price_history')
    .select('link_id, price, created_at')
    .in('link_id', linkIds)
    .order('created_at', { ascending: false })
    .limit(PRICE_HISTORY_SCAN_LIMIT);

  if (error) {
    console.error('[queries] could not read price_history:', error.message);
    return latest;
  }

  for (const row of (data || []) as RawPrice[]) {
    if (!latest.has(row.link_id)) {
      latest.set(row.link_id, row);
    }
  }

  return latest;
}

async function fetchCheckStates(
  supabase: SupabaseClient,
  productIds: string[]
): Promise<Map<string, 'queued' | 'checking'>> {
  const states = new Map<string, 'queued' | 'checking'>();
  if (productIds.length === 0) return states;

  const since = new Date(Date.now() - OPEN_CHECK_MS).toISOString();
  // Column grant is only id, product_id, link_id, status, created_at.
  // requested_by, runner and last_error are not readable here.
  const { data, error } = await supabase
    .from('crawl_jobs')
    .select('id, product_id, link_id, status, created_at')
    .in('product_id', productIds)
    .in('status', ['pending', 'running'])
    .gte('created_at', since);

  if (error) {
    // Missing grant or table (migration not applied) just means we cannot
    // tell a queued check from "no price yet". Do not pretend one is queued.
    if (!/crawl_jobs|permission denied|42501|42P01/i.test(error.message)) {
      console.error('[queries] could not read crawl_jobs:', error.message);
    }
    return states;
  }

  for (const row of (data || []) as { product_id: string | null; status: string }[]) {
    if (!row.product_id) continue;
    if (row.status === 'running') states.set(row.product_id, 'checking');
    else if (states.get(row.product_id) !== 'checking') states.set(row.product_id, 'queued');
  }
  return states;
}

function offerRank(link: LinkView): number {
  if (link.latestPrice === null) return 2;
  if (link.priceStale) return 1;
  return 0;
}

function parseStockStatus(value: string | null | undefined): LinkView['stockStatus'] {
  if (value === 'unavailable' || value === 'in_stock') {
    return value;
  }
  return 'unknown';
}

type RawEvent = {
  link_id: string | null;
  message: string | null;
  created_at: string;
};

async function fetchUnavailableEvents(
  supabase: SupabaseClient,
  linkIds: string[]
): Promise<Map<string, RawEvent>> {
  const latest = new Map<string, RawEvent>();
  if (linkIds.length === 0) {
    return latest;
  }

  const { data, error } = await supabase
    .from('crawl_events')
    .select('link_id, message, created_at')
    .in('link_id', linkIds)
    .ilike('message', '%currently unavailable%')
    .order('created_at', { ascending: false })
    .limit(PRICE_HISTORY_SCAN_LIMIT);

  if (error) {
    console.error('[queries] could not read crawl_events:', error.message);
    return latest;
  }

  for (const row of (data || []) as RawEvent[]) {
    if (row.link_id && !latest.has(row.link_id)) {
      latest.set(row.link_id, row);
    }
  }

  return latest;
}

export async function fetchProducts(
  supabase: SupabaseClient = getReadClient(),
  ownerId?: string
): Promise<ProductView[]> {

  let products: RawProduct[] = [];
  for (const columns of PRODUCT_SELECTS) {
    let query = supabase
      .from('products')
      .select(columns)
      .order('name', { ascending: true });
    if (ownerId) {
      query = query.eq('owner_id', ownerId);
    }
    const { data, error } = await query;

    if (!error) {
      products = (data || []) as unknown as RawProduct[];
      break;
    }
    if (!isMissingColumn(error.message) || columns === PRODUCT_SELECTS[PRODUCT_SELECTS.length - 1]) {
      throw new Error(error.message);
    }
  }
  if (products.length === 0) {
    return [];
  }

  const linksByProduct = await fetchLinks(
    supabase,
    products.map((product) => product.id)
  );

  const allLinks = [...linksByProduct.values()].flat();
  const linkIds = allLinks.map((link) => link.id);
  // Stock already stored on the link does not need a text search of crawl events.
  const unknownStockIds = allLinks
    .filter((link) => parseStockStatus(link.stock_status) === 'unknown')
    .map((link) => link.id);
  const [latestPrices, unavailableEvents, checkStates] = await Promise.all([
    fetchLatestPrices(supabase, linkIds),
    fetchUnavailableEvents(supabase, unknownStockIds),
    fetchCheckStates(
      supabase,
      products.map((product) => product.id)
    )
  ]);

  return products.map((product) => {
    const links: LinkView[] = (linksByProduct.get(product.id) || []).map((link) => {
      const latest = latestPrices.get(link.id) ?? null;
      const unavailableEvent = unavailableEvents.get(link.id);
      let stockStatus = parseStockStatus(link.stock_status);
      if (
        stockStatus !== 'in_stock' &&
        unavailableEvent &&
        (!latest || unavailableEvent.created_at >= latest.created_at)
      ) {
        stockStatus = 'unavailable';
      }
      const unavailable = stockStatus === 'unavailable';
      const amount = unavailable ? null : latest ? toNumber(latest.price) : null;
      const latestAt = unavailable
        ? link.stock_checked_at || unavailableEvent?.created_at || latest?.created_at || null
        : latest?.created_at ?? null;
      return {
        id: link.id,
        retailer: link.retailer || 'Unknown shop',
        url: link.url || '',
        isActive: link.is_active !== false,
        stockStatus,
        latestPrice: amount,
        priceStale: amount !== null && isStaleCheckedAt(latestAt),
        latestAt,
        imageUrl: link.image_url || null,
        imageCandidates: stringList(link.image_candidates),
        createdAt: link.created_at || null
      };
    });

    links.sort((a, b) => {
      const rank = offerRank(a) - offerRank(b);
      if (rank !== 0) return rank;
      if (a.latestPrice === null || b.latestPrice === null) {
        return a.retailer.localeCompare(b.retailer);
      }
      if (a.priceStale && b.priceStale) {
        const aTime = a.latestAt ? new Date(a.latestAt).getTime() : -Infinity;
        const bTime = b.latestAt ? new Date(b.latestAt).getTime() : -Infinity;
        const aMs = Number.isNaN(aTime) ? -Infinity : aTime;
        const bMs = Number.isNaN(bTime) ? -Infinity : bTime;
        if (aMs !== bMs) return bMs - aMs;
      }
      return a.latestPrice - b.latestPrice;
    });

    const cheapest =
      links.find((link) => link.isActive && link.latestPrice !== null && !link.priceStale) ?? null;

    return {
      id: product.id,
      name: product.name,
      categoryId: product.category_id,
      categoryName: categoryName(product.categories),
      targetPrice: toNumber(product.target_price),
      imageUrl: product.image_url || null,
      links,
      lowestPrice: cheapest?.latestPrice ?? null,
      lowestRetailer: cheapest?.retailer ?? null,
      checkState: checkStates.get(product.id)
    } satisfies ProductView;
  });
}

export async function fetchCategories(
  supabase: SupabaseClient = getReadClient(),
  ownerId?: string
): Promise<CategoryView[]> {
  let query = supabase
    .from('categories')
    .select('id, name, is_public')
    .order('name', { ascending: true });
  if (ownerId) {
    query = query.eq('owner_id', ownerId);
  }
  const { data, error } = await query;

  if (!error) {
    return (data || []).map((category) => ({
      id: category.id,
      name: category.name,
      isPublic: category.is_public !== false
    }));
  }

  if (!isMissingColumn(error.message)) {
    throw new Error(error.message);
  }

  let fallback = supabase.from('categories').select('id, name').order('name');
  if (ownerId) fallback = fallback.eq('owner_id', ownerId);
  const { data: fallbackData, error: fallbackError } = await fallback;
  if (fallbackError) throw new Error(fallbackError.message);
  return (fallbackData || []).map((category) => ({
    id: category.id,
    name: category.name,
    isPublic: true
  }));
}
