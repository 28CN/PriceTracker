import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { cleanHttpUrl, isTrackableSearchUrl } from '@/lib/productUrl';
import { detectRetailer, hasCrawlerSupport, SUPPORTED_RETAILERS } from '@/lib/retailer';

/** One Google Shopping result. `token` fetches its shop list later. */
export type ShopHit = {
  id: string;
  name: string;
  price: number | null;
  imageUrl: string | null;
  shop: string;
  token: string | null;
  supported: boolean;
};

/** One shop selling a product, with a direct retailer link. */
export type ShopOffer = {
  shop: string;
  url: string;
  price: number | null;
  trackable: boolean;
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

function norm(value: string): string {
  return value.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '');
}

/** Google shows names like "BIG W" or "Coles Supermarkets"; match them to shops we crawl. */
export function isSupportedShopName(shop: string): boolean {
  if (hasCrawlerSupport(shop)) return true;
  const needle = norm(shop);
  return SUPPORTED_RETAILERS.some(({ name }) => needle.startsWith(norm(name)));
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
    hits.push({
      id,
      name,
      price: priceOf(row.extracted_price),
      imageUrl: httpsOrNull(row.serpapi_thumbnail) || httpsOrNull(row.thumbnail),
      shop,
      token: typeof row.immersive_product_page_token === 'string' ? row.immersive_product_page_token : null,
      supported: isSupportedShopName(shop)
    });
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
