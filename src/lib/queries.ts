import type { SupabaseClient } from '@supabase/supabase-js';

import { toNumber } from './format';
import { getReadClient } from './supabase';
import type { ListKind } from './listKind';
import type { CategoryView, LinkView, ProductView } from './types';

export type ProductScope = 'live' | ListKind;

type RawProduct = {
  id: string;
  name: string;
  target_price: number | string | null;
  category_id: string | null;
  list_kind?: string | null;
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

async function fetchLinks(
  supabase: SupabaseClient,
  productIds: string[]
): Promise<Map<string, RawLink[]>> {
  const byProduct = new Map<string, RawLink[]>();

  const { data, error } = await supabase
    .from('tracked_links')
    .select('id, product_id, retailer, url, is_active, stock_status, stock_checked_at')
    .in('product_id', productIds);

  // A link failure must not hide the products themselves.
  if (error) {
    if (/stock_status|stock_checked_at/.test(error.message)) {
      const fallback = await supabase
        .from('tracked_links')
        .select('id, product_id, retailer, url, is_active')
        .in('product_id', productIds);
      if (fallback.error) {
        console.error('[queries] could not read tracked_links:', fallback.error.message);
        return byProduct;
      }
      for (const link of (fallback.data || []) as RawLink[]) {
        const bucket = byProduct.get(link.product_id);
        if (bucket) {
          bucket.push(link);
        } else {
          byProduct.set(link.product_id, [link]);
        }
      }
      return byProduct;
    }
    console.error('[queries] could not read tracked_links:', error.message);
    return byProduct;
  }

  for (const link of (data || []) as RawLink[]) {
    const bucket = byProduct.get(link.product_id);
    if (bucket) {
      bucket.push(link);
    } else {
      byProduct.set(link.product_id, [link]);
    }
  }

  return byProduct;
}

async function fetchLatestPrices(
  supabase: SupabaseClient,
  linkIds: string[]
): Promise<Map<string, RawPrice>> {
  const latest = new Map<string, RawPrice>();

  if (linkIds.length === 0) {
    return latest;
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

export async function fetchProducts(scope: ProductScope = 'live'): Promise<ProductView[]> {
  const supabase = getReadClient();
  const withKind =
    'id, name, target_price, category_id, list_kind, image_url, categories(id, name)';
  const legacy = 'id, name, target_price, category_id, categories(id, name)';

  const base = supabase.from('products').select(withKind).order('name', { ascending: true });
  const scoped = scope === 'live' ? base.neq('list_kind', 'daily') : base.eq('list_kind', scope);
  let { data, error } = await scoped;

  if (error && /list_kind|image_url/.test(error.message)) {
    const fallback = await supabase
      .from('products')
      .select(legacy)
      .order('name', { ascending: true });
    data = fallback.data as typeof data;
    error = fallback.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  const products = (data || []) as unknown as RawProduct[];
  if (products.length === 0) {
    return [];
  }

  const linksByProduct = await fetchLinks(
    supabase,
    products.map((product) => product.id)
  );

  const allLinks = [...linksByProduct.values()].flat();
  const latestPrices = await fetchLatestPrices(
    supabase,
    allLinks.map((link) => link.id)
  );
  const unavailableEvents = await fetchUnavailableEvents(
    supabase,
    allLinks.map((link) => link.id)
  );

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
      return {
        id: link.id,
        retailer: link.retailer || 'Unknown shop',
        url: link.url || '',
        isActive: link.is_active !== false,
        stockStatus,
        latestPrice: unavailable ? null : latest ? toNumber(latest.price) : null,
        latestAt: unavailable
          ? link.stock_checked_at || unavailableEvent?.created_at || latest?.created_at || null
          : latest?.created_at ?? null
      };
    });

    links.sort((a, b) => {
      if (a.latestPrice === null && b.latestPrice === null) {
        return a.retailer.localeCompare(b.retailer);
      }
      if (a.latestPrice === null) return 1;
      if (b.latestPrice === null) return -1;
      return a.latestPrice - b.latestPrice;
    });

    const cheapest = links.find((link) => link.isActive && link.latestPrice !== null) ?? null;

    return {
      id: product.id,
      name: product.name,
      categoryId: product.category_id,
      categoryName: categoryName(product.categories),
      targetPrice: toNumber(product.target_price),
      listKind: product.list_kind === 'daily' ? 'daily' : 'daigou',
      imageUrl: product.image_url || null,
      links,
      lowestPrice: cheapest?.latestPrice ?? null,
      lowestRetailer: cheapest?.retailer ?? null
    } satisfies ProductView;
  });
}

export async function fetchCategories(): Promise<CategoryView[]> {
  const supabase = getReadClient();

  const { data, error } = await supabase
    .from('categories')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as CategoryView[];
}
