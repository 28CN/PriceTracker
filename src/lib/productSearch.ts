import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { cleanHttpUrl, isTrackableSearchUrl } from '@/lib/productUrl';
import { detectRetailer, hasCrawlerSupport, SUPPORTED_RETAILERS } from '@/lib/retailer';
import {
  compactSearchText,
  matchPreparedCandidate,
  prepareCandidate,
  prepareQuery
} from '@/lib/searchMatch';

/** One Google Shopping result. `token` fetches its shop list later. */
export type ShopHit = {
  id: string;
  name: string;
  price: number | null;
  imageUrl: string | null;
  shop: string;
  token: string | null;
  supported: boolean;
  url?: string | null;
  fetchedAt?: string;
  stale?: boolean;
};

/** One shop selling a product, with a direct retailer link. */
export type ShopOffer = {
  shop: string;
  url: string;
  price: number | null;
  trackable: boolean;
};

export type CacheSearchRow = {
  query_key: string;
  results: unknown;
  fetched_at: string;
};

export type QuotaResult = 'ok' | 'user_day' | 'user_month' | 'site_day' | 'error';

export const LIMITS = { userDay: 5, userMonth: 30, siteDay: 8 };
export const CACHE_HOURS = 24;
export const MIN_TRACKED_MATCHES = 3;

const SERPAPI = 'https://serpapi.com/search.json';
const AU_PARAMS = { gl: 'au', hl: 'en', google_domain: 'google.com.au', location: 'Australia' };

export function normalizeQuery(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}$.&'+-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/** Normalised cache key so "hotwheels", "hot wheels" and "Hot-Wheels" share one entry. */
export function cacheKeyForQuery(raw: string): string {
  const compact = compactSearchText(raw).slice(0, 120);
  if (compact) return `q:${compact}`;
  return `q:${normalizeQuery(raw)}`;
}

function norm(value: string): string {
  return value.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '');
}

/** Google shows names like "BIG W" or "Coles Supermarkets"; match them to shops we crawl. */
export function isSupportedShopName(shop: string): boolean {
  if (hasCrawlerSupport(shop)) return true;
  // Match on whole words anywhere, so "Mr Toys Toyworld" finds Toyworld.
  const words = shop.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const runs = new Set<string>();
  for (let start = 0; start < words.length; start += 1) {
    for (let end = start + 1; end <= Math.min(words.length, start + 4); end += 1) {
      runs.add(words.slice(start, end).join(''));
    }
  }
  return SUPPORTED_RETAILERS.some(({ name }) => runs.has(norm(name)) || norm(shop).startsWith(norm(name)));
}

function httpsOrNull(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function priceOf(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null;
}

type RawShopping = {
  product_id?: string;
  title?: string;
  source?: string;
  extracted_price?: number;
  thumbnail?: string;
  serpapi_thumbnail?: string;
  immersive_product_page_token?: string;
  link?: string;
  product_link?: string;
};

export function parseShoppingResults(payload: unknown, max = 12): ShopHit[] {
  const rows = ((payload as { shopping_results?: RawShopping[] })?.shopping_results || []).slice(0, 40);
  const hits: ShopHit[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const name = (row.title || '').replace(/\s+/g, ' ').trim().slice(0, 180);
    const shop = (row.source || '').trim().slice(0, 80);
    const id = String(row.product_id || '').replace(/\D/g, '');
    if (!name || !shop || !id || seen.has(id)) continue;
    seen.add(id);
    const url = cleanHttpUrl(row.link || '') || cleanHttpUrl(row.product_link || '');
    const hit: ShopHit = {
      id,
      name,
      price: priceOf(row.extracted_price),
      imageUrl: httpsOrNull(row.serpapi_thumbnail) || httpsOrNull(row.thumbnail),
      shop,
      token: typeof row.immersive_product_page_token === 'string' ? row.immersive_product_page_token : null,
      supported: isSupportedShopName(shop)
    };
    if (url) hit.url = url;
    hits.push(hit);
    if (hits.length >= max) break;
  }
  // Shops we can keep an eye on come first.
  return hits.sort((a, b) => Number(b.supported) - Number(a.supported));
}

type RawStore = { name?: string; link?: string; extracted_price?: number };

export function parseStores(payload: unknown): ShopOffer[] {
  const stores = (payload as { product_results?: { stores?: RawStore[] } })?.product_results?.stores || [];
  const offers: ShopOffer[] = [];
  const seen = new Set<string>();
  for (const store of stores.slice(0, 20)) {
    const url = store.link ? cleanHttpUrl(store.link) : null;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    offers.push({
      shop: detectRetailer(url) || (store.name || '').trim().slice(0, 80),
      url,
      price: priceOf(store.extracted_price),
      trackable: isTrackableSearchUrl(url)
    });
  }
  return offers.sort((a, b) => Number(b.trackable) - Number(a.trackable));
}

function isShopHit(value: unknown): value is ShopHit {
  if (!value || typeof value !== 'object') return false;
  const hit = value as Record<string, unknown>;
  return (
    typeof hit.id === 'string' &&
    hit.id.length > 0 &&
    typeof hit.name === 'string' &&
    hit.name.length > 0 &&
    typeof hit.shop === 'string' &&
    hit.shop.length > 0
  );
}

/**
 * Fuzzily match a query against shared `product_search_cache` rows (including stale entries),
 * deduplicating by product id and marking stale hits with `stale: true` and `fetchedAt`.
 */
export function matchCachedShopHits(
  query: string,
  rows: readonly CacheSearchRow[],
  nowMs = Date.now(),
  limit = 12
): ShopHit[] {
  const preparedQuery = prepareQuery(query);
  if (!preparedQuery || rows.length === 0) return [];

  const staleCutoffMs = nowMs - CACHE_HOURS * 3600 * 1000;
  const sortedRows = rows.toSorted((a, b) => {
    const ta = new Date(a.fetched_at).getTime();
    const tb = new Date(b.fetched_at).getTime();
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });

  const bestById = new Map<string, { hit: ShopHit; score: number; fetchedMs: number; stale: boolean }>();

  for (const row of sortedRows) {
    if (!Array.isArray(row.results)) continue;
    const rawMs = new Date(row.fetched_at).getTime();
    const fetchedMs = Number.isNaN(rawMs) ? 0 : rawMs;
    const stale = fetchedMs < staleCutoffMs;

    const keyText = row.query_key.replace(/^q:/, '');
    const keyMatch = matchPreparedCandidate(preparedQuery, prepareCandidate({ name: keyText }));

    for (const entry of row.results) {
      if (!isShopHit(entry)) continue;
      const direct = matchPreparedCandidate(
        preparedQuery,
        prepareCandidate({ name: entry.name, shops: [entry.shop] })
      );
      const score = direct
        ? direct.score
        : keyMatch?.kind === 'exact'
          ? Math.round(keyMatch.score * 5.5) / 10
          : 0;
      if (score <= 0) continue;

      const hit: ShopHit = {
        ...entry,
        fetchedAt: row.fetched_at,
        stale
      };

      const existing = bestById.get(entry.id);
      if (!existing) {
        bestById.set(entry.id, { hit, score, fetchedMs, stale });
      } else if (fetchedMs > existing.fetchedMs) {
        bestById.set(entry.id, {
          hit,
          score: Math.max(score, existing.score),
          fetchedMs,
          stale
        });
      } else if (score > existing.score) {
        existing.score = score;
      }
    }
  }

  return [...bestById.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.stale !== b.stale) return Number(a.stale) - Number(b.stale);
      if (a.hit.supported !== b.hit.supported) return Number(b.hit.supported) - Number(a.hit.supported);
      return b.fetchedMs - a.fetchedMs;
    })
    .slice(0, limit)
    .map((entry) => entry.hit);
}

export function serpApiKey(): string | null {
  return process.env.SERPAPI_API_KEY?.trim() || null;
}

async function serpApi(params: Record<string, string>): Promise<unknown> {
  const key = serpApiKey();
  if (!key) throw new Error('SerpApi key missing.');
  const url = new URL(SERPAPI);
  for (const [name, value] of Object.entries({ ...AU_PARAMS, ...params })) {
    url.searchParams.set(name, value);
  }
  url.searchParams.set('api_key', key);
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`SerpApi responded ${response.status}.`);
  const payload = (await response.json()) as { error?: string };
  if (payload.error && !/hasn't returned any results/i.test(payload.error)) {
    throw new Error('SerpApi error.');
  }
  return payload;
}

export async function fetchShopHits(query: string): Promise<ShopHit[]> {
  return parseShoppingResults(await serpApi({ engine: 'google_shopping', q: query }));
}

export async function fetchShopOffers(token: string): Promise<ShopOffer[]> {
  return parseStores(await serpApi({ engine: 'google_immersive_product', page_token: token }));
}

export async function readCache<T>(key: string): Promise<T | null> {
  const admin = createAdminSupabaseClient();
  const since = new Date(Date.now() - CACHE_HOURS * 3600 * 1000).toISOString();
  const { data, error } = await admin
    .from('product_search_cache')
    .select('results')
    .eq('query_key', key)
    .gte('fetched_at', since)
    .maybeSingle();
  if (error) {
    console.error('[search] cache read failed:', error.message);
    return null;
  }
  return (data?.results as T) ?? null;
}

/** Check fresh (<= 24h) cache for either the compact key or the legacy spaced key. */
export async function readFreshQueryCache(
  rawQuery: string
): Promise<{ hits: ShopHit[]; fetchedAt: string } | null> {
  const admin = createAdminSupabaseClient();
  const since = new Date(Date.now() - CACHE_HOURS * 3600 * 1000).toISOString();
  const compactKey = cacheKeyForQuery(rawQuery);
  const legacyKey = `q:${normalizeQuery(rawQuery)}`;
  const keys = compactKey === legacyKey ? [compactKey] : [compactKey, legacyKey];

  const { data, error } = await admin
    .from('product_search_cache')
    .select('results, fetched_at')
    .in('query_key', keys)
    .gte('fetched_at', since)
    .order('fetched_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[search] fresh cache read failed:', error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || !Array.isArray(row.results)) return null;
  return {
    hits: (row.results as ShopHit[]).map((hit) => ({
      ...hit,
      fetchedAt: row.fetched_at,
      stale: false
    })),
    fetchedAt: row.fetched_at
  };
}

/** Read all cached query rows (fresh and stale) and fuzzily match them in TypeScript. */
export async function searchSharedCache(query: string, limit = 12): Promise<ShopHit[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from('product_search_cache')
    .select('query_key, results, fetched_at')
    .like('query_key', 'q:%')
    .order('fetched_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[search] cache scan failed:', error.message);
    return [];
  }

  return matchCachedShopHits(query, (data || []) as CacheSearchRow[], Date.now(), limit);
}

export async function writeCache(key: string, results: unknown): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from('product_search_cache')
    .upsert({ query_key: key, results, fetched_at: new Date().toISOString() });
  if (error) console.error('[search] cache write failed:', error.message);
}

export async function consumeSearchQuota(userId: string): Promise<QuotaResult> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc('consume_search_quota', {
    p_user: userId,
    p_day_limit: LIMITS.userDay,
    p_month_limit: LIMITS.userMonth,
    p_site_limit: LIMITS.siteDay
  });
  if (error) {
    console.error('[search] quota check failed:', error.message);
    return 'error';
  }
  return (data as QuotaResult) || 'error';
}
