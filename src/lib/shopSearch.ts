import { detectRetailer } from '@/lib/retailer';

export type SearchHit = {
  retailer: string;
  retailerId: string;
  name: string;
  price: number | null;
  url: string;
  imageUrl: string | null;
};

export type ShopSearchResult = {
  retailer: string;
  retailerId: string;
  results: SearchHit[];
  fallbackUrl: string;
  error?: string;
};

export type SearchRetailer = {
  id: string;
  name: string;
  defaultOn: boolean;
  fallbackUrl: (query: string) => string;
};

export const SEARCH_RETAILERS: SearchRetailer[] = [
  {
    id: 'coles',
    name: 'Coles',
    defaultOn: true,
    fallbackUrl: (q) => `https://www.coles.com.au/search?q=${encodeURIComponent(q)}`
  },
  {
    id: 'woolworths',
    name: 'Woolworths',
    defaultOn: true,
    fallbackUrl: (q) =>
      `https://www.woolworths.com.au/shop/search/products?searchTerm=${encodeURIComponent(q)}`
  },
  {
    id: 'rejectshop',
    name: 'The Reject Shop',
    defaultOn: true,
    fallbackUrl: (q) => `https://www.therejectshop.com.au/search?q=${encodeURIComponent(q)}`
  },
  {
    id: 'target',
    name: 'Target',
    defaultOn: true,
    fallbackUrl: (q) => `https://www.target.com.au/search?text=${encodeURIComponent(q)}`
  },
  {
    id: 'kmart',
    name: 'Kmart',
    defaultOn: true,
    fallbackUrl: (q) => `https://www.kmart.com.au/search?q=${encodeURIComponent(q)}`
  },
  {
    id: 'bunnings',
    name: 'Bunnings',
    defaultOn: true,
    fallbackUrl: (q) => `https://www.bunnings.com.au/search/products?q=${encodeURIComponent(q)}`
  },
  {
    id: 'chemistwarehouse',
    name: 'Chemist Warehouse',
    defaultOn: true,
    fallbackUrl: (q) =>
      `https://www.chemistwarehouse.com.au/search?searchtext=${encodeURIComponent(q)}`
  },
  {
    id: 'priceline',
    name: 'Priceline',
    defaultOn: true,
    fallbackUrl: (q) => `https://www.priceline.com.au/search?q=${encodeURIComponent(q)}`
  },
  {
    id: 'bigw',
    name: 'Big W',
    defaultOn: false,
    fallbackUrl: (q) => `https://www.bigw.com.au/search?text=${encodeURIComponent(q)}`
  },
  {
    id: 'terrywhite',
    name: 'Terry White',
    defaultOn: false,
    fallbackUrl: (q) =>
      `https://www.terrywhitechemmart.com.au/search?q=${encodeURIComponent(q)}`
  }
];

const RESULT_CAP = 8;
const FETCH_MS = 12000;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function shopHeaders(origin: string, referer?: string, extra?: HeadersInit): HeadersInit {
  return {
    'User-Agent': BROWSER_UA,
    Accept: 'application/json, text/html, */*',
    'Accept-Language': 'en-AU,en;q=0.9',
    Origin: origin,
    Referer: referer || `${origin}/`,
    ...extra
  };
}

function cookiesFrom(response: Response): string {
  const getter = (
    response.headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie;
  const parts = typeof getter === 'function' ? getter.call(response.headers) : [];
  if (parts.length === 0) {
    const single = response.headers.get('set-cookie');
    return single ? single.split(',')[0] : '';
  }
  return parts.map((row) => row.split(';')[0]).join('; ');
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(FETCH_MS) });
}

function toAbs(base: string, maybeUrl: string | null | undefined): string | null {
  if (!maybeUrl) return null;
  try {
    return new URL(maybeUrl, base).toString();
  } catch {
    return null;
  }
}

function parseMoney(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string') {
    const match = value.replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return (
      parseMoney(record.now) ??
      parseMoney(record.current) ??
      parseMoney(record.amount) ??
      parseMoney(record.min) ??
      parseMoney(record.lowPrice) ??
      parseMoney(record.price)
    );
  }
  return null;
}

function pickImage(node: Record<string, unknown>): string | null {
  const direct =
    node.imageUrl ||
    node.imageURL ||
    node.SmallImageFile ||
    node.MediumImageFile ||
    node.image ||
    node.thumbnail ||
    node.featuredImage;
  if (typeof direct === 'string') return direct;
  if (Array.isArray(direct) && typeof direct[0] === 'string') return direct[0];
  if (direct && typeof direct === 'object') {
    const nested = direct as Record<string, unknown>;
    if (typeof nested.url === 'string') return nested.url;
    if (typeof nested.src === 'string') return nested.src;
  }
  if (Array.isArray(direct) && direct[0] && typeof direct[0] === 'object') {
    const nested = direct[0] as Record<string, unknown>;
    if (typeof nested.url === 'string') return nested.url;
    if (typeof nested.src === 'string') return nested.src;
  }
  return null;
}

function isProductUrl(url: string, retailerId?: string): boolean {
  let path = url;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    path = url.toLowerCase();
  }

  if (
    path.includes('/search') ||
    path.includes('/category') ||
    path.includes('/categories') ||
    path === '/'
  ) {
    return false;
  }

  if (
    path.includes('/product') ||
    path.includes('productdetails') ||
    path.includes('/buy/') ||
    /\/products\//.test(path) ||
    /_p\d+/.test(path)
  ) {
    return true;
  }

  if (
    (retailerId === 'target' || retailerId === 'bigw' || retailerId === 'kmart') &&
    /\/p\/[a-z0-9-]+/i.test(path)
  ) {
    return true;
  }

  return false;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function collectHits(
  node: unknown,
  origin: string,
  retailerId: string,
  retailerName: string,
  out: SearchHit[],
  seen: Set<string>,
  depth = 0
): void {
  if (out.length >= RESULT_CAP || depth > 12) return;

  if (Array.isArray(node)) {
    for (const item of node) {
      collectHits(item, origin, retailerId, retailerName, out, seen, depth + 1);
      if (out.length >= RESULT_CAP) return;
    }
    return;
  }

  const record = asRecord(node);
  if (!record) return;

  const name =
    (typeof record.DisplayName === 'string' && record.DisplayName) ||
    (typeof record.name === 'string' && record.name) ||
    (typeof record.title === 'string' && record.title) ||
    (typeof record.productName === 'string' && record.productName) ||
    (typeof record.headline === 'string' && record.headline) ||
    '';

  const urlRaw =
    (typeof record.url === 'string' && record.url) ||
    (typeof record.Url === 'string' && record.Url) ||
    (typeof record.productUrl === 'string' && record.productUrl) ||
    (typeof record.pdpUrl === 'string' && record.pdpUrl) ||
    (typeof record.seoToken === 'string' && record.seoToken) ||
    (typeof record.seoUrl === 'string' && record.seoUrl) ||
    (typeof record.link === 'string' && record.link) ||
    (typeof record['@id'] === 'string' && record['@id']) ||
    '';

  const stockcode = record.Stockcode ?? record.stockcode ?? record.sku;
  const slug =
    (typeof record.UrlFriendlyName === 'string' && record.UrlFriendlyName) ||
    (typeof record.slug === 'string' && record.slug) ||
    '';

  let url = toAbs(origin, urlRaw);
  if (!url && retailerId === 'woolworths' && stockcode) {
    url = `https://www.woolworths.com.au/shop/productdetails/${stockcode}/${slug || 'product'}`;
  }

  const price =
    parseMoney(record.Price) ??
    parseMoney(record.InstantPrice) ??
    parseMoney(record.price) ??
    parseMoney(record.currentPrice) ??
    parseMoney(record.pricing) ??
    parseMoney(record.priceInfo) ??
    parseMoney(record.offers);

  if (name && url && isProductUrl(url, retailerId) && !seen.has(url)) {
    seen.add(url);
    out.push({
      retailer: retailerName,
      retailerId,
      name: name.trim(),
      price,
      url,
      imageUrl: toAbs(origin, pickImage(record))
    });
  }

  for (const value of Object.values(record)) {
    if (out.length >= RESULT_CAP) return;
    if (value && typeof value === 'object') {
      collectHits(value, origin, retailerId, retailerName, out, seen, depth + 1);
    }
  }
}

function extractNextData(html: string): unknown | null {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function extractJsonLd(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    try {
      blocks.push(JSON.parse(match[1]));
    } catch {
      // Ignore broken JSON-LD blocks.
    }
  }
  return blocks;
}

function nameFromUrl(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const last = (parts[parts.length - 1] || parts[parts.length - 2] || '')
      .replace(/\.\w+$/, '')
      .replace(/\b\d{4,}\b/g, '');
    const cleaned = decodeURIComponent(last)
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned.length >= 3 ? cleaned : 'Product';
  } catch {
    return 'Product';
  }
}

function collectHitsFromMarkup(
  html: string,
  origin: string,
  retailerId: string,
  retailerName: string,
  out: SearchHit[],
  seen: Set<string>
): void {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');

  const hrefRe = /href=["']([^"']+)["']/gi;
  const candidates: { url: string; index: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = hrefRe.exec(cleaned))) {
    const abs = toAbs(origin, match[1].split('#')[0]);
    if (!abs || !isProductUrl(abs, retailerId)) continue;
    if (candidates.some((item) => item.url === abs)) continue;
    candidates.push({ url: abs, index: match.index });
  }

  for (const candidate of candidates) {
    if (out.length >= RESULT_CAP) return;
    if (seen.has(candidate.url)) continue;

    const snippet = cleaned.slice(Math.max(0, candidate.index - 500), candidate.index + 900);
    const img = snippet.match(
      /<img[^>]+(?:src=["']([^"']+)["'][^>]*alt=["']([^"']*)["']|alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'])/i
    );
    const heading = snippet.match(
      /<(?:h[1-6]|p|span|div)[^>]*>\s*([^<]{4,140})\s*<\/(?:h[1-6]|p|span|div)>/i
    );
    const alt = (img?.[2] || img?.[3] || '').trim();
    const headingText = (heading?.[1] || '').replace(/\s+/g, ' ').trim();
    const name = alt || headingText || nameFromUrl(candidate.url);
    if (!name || /skip to|sign in|log in|cart/i.test(name)) continue;

    const priceMatch = snippet.replace(/,/g, '').match(/\$(\d+(?:\.\d{1,2})?)/);
    const src = img?.[1] || img?.[4] || null;

    seen.add(candidate.url);
    out.push({
      retailer: retailerName,
      retailerId,
      name: name.slice(0, 160),
      price: priceMatch ? Number(priceMatch[1]) : null,
      url: candidate.url,
      imageUrl: toAbs(origin, src)
    });
  }
}

async function searchFromHtml(
  pageUrl: string,
  origin: string,
  retailerId: string,
  retailerName: string
): Promise<SearchHit[]> {
  const response = await fetchWithTimeout(pageUrl, {
    headers: shopHeaders(origin, pageUrl)
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const html = await response.text();
  const hits: SearchHit[] = [];
  const seen = new Set<string>();

  const nextData = extractNextData(html);
  if (nextData) {
    collectHits(nextData, origin, retailerId, retailerName, hits, seen);
  }
  if (hits.length < RESULT_CAP) {
    for (const block of extractJsonLd(html)) {
      collectHits(block, origin, retailerId, retailerName, hits, seen);
      if (hits.length >= RESULT_CAP) break;
    }
  }
  if (hits.length < RESULT_CAP) {
    collectHitsFromMarkup(html, origin, retailerId, retailerName, hits, seen);
  }
  return hits;
}

async function searchWoolworths(query: string): Promise<SearchHit[]> {
  const origin = 'https://www.woolworths.com.au';
  const referer = `https://www.woolworths.com.au/shop/search/products?searchTerm=${encodeURIComponent(query)}`;
  const home = await fetchWithTimeout(`${origin}/`, { headers: shopHeaders(origin) });
  const cookie = cookiesFrom(home);

  const response = await fetchWithTimeout(`${origin}/apis/ui/Search/products`, {
    method: 'POST',
    headers: shopHeaders(origin, referer, {
      'Content-Type': 'application/json',
      Cookie: cookie
    }),
    body: JSON.stringify({
      SearchTerm: query,
      PageNumber: 1,
      PageSize: RESULT_CAP,
      SortType: 'TraderRelevance',
      Location: '',
      Filters: [],
      IsSpecial: false
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  const hits: SearchHit[] = [];
  collectHits(payload, origin, 'woolworths', 'Woolworths', hits, new Set());
  if (hits.length > 0) return hits;
  return searchFromHtml(referer, origin, 'woolworths', 'Woolworths');
}

async function searchColes(query: string): Promise<SearchHit[]> {
  const origin = 'https://www.coles.com.au';
  const pageUrl = `https://www.coles.com.au/search?q=${encodeURIComponent(query)}`;
  const endpoints = [
    `${origin}/api/products/v2/search?q=${encodeURIComponent(query)}&limit=${RESULT_CAP}`,
    `${origin}/api/products/search?q=${encodeURIComponent(query)}`
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        headers: shopHeaders(origin, pageUrl)
      });
      if (!response.ok) continue;
      const payload = (await response.json()) as unknown;
      const hits: SearchHit[] = [];
      collectHits(payload, origin, 'coles', 'Coles', hits, new Set());
      if (hits.length > 0) return hits;
    } catch {
      // Try the next public endpoint, then the search page itself.
    }
  }

  return searchFromHtml(pageUrl, origin, 'coles', 'Coles');
}

async function searchShopify(origin: string, query: string, retailerId: string, name: string) {
  const url = `${origin}/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=${RESULT_CAP}`;
  const response = await fetchWithTimeout(url, { headers: shopHeaders(origin) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  const hits: SearchHit[] = [];
  collectHits(payload, origin, retailerId, name, hits, new Set());
  if (hits.length > 0) return hits;

  const searchJson = await fetchWithTimeout(
    `${origin}/search.json?q=${encodeURIComponent(query)}&type=product`,
    { headers: shopHeaders(origin) }
  );
  if (!searchJson.ok) return hits;
  collectHits(await searchJson.json(), origin, retailerId, name, hits, new Set());
  return hits;
}

async function searchChemistWarehouse(query: string): Promise<SearchHit[]> {
  const origin = 'https://www.chemistwarehouse.com.au';
  const pageUrl = `${origin}/search?searchtext=${encodeURIComponent(query)}`;
  const endpoints = [
    `${origin}/searchapi/webapi/search/terms?term=${encodeURIComponent(query)}`,
    `${origin}/searchapi/webapi/search/searchproducts?searchtext=${encodeURIComponent(query)}`
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        headers: shopHeaders(origin, pageUrl)
      });
      if (!response.ok) continue;
      const payload = (await response.json()) as unknown;
      const hits: SearchHit[] = [];
      collectHits(payload, origin, 'chemistwarehouse', 'Chemist Warehouse', hits, new Set());
      if (hits.length > 0) return hits;
    } catch {
      // Fall through to the HTML search page.
    }
  }

  return searchFromHtml(pageUrl, origin, 'chemistwarehouse', 'Chemist Warehouse');
}

const ADAPTERS: Record<string, (query: string) => Promise<SearchHit[]>> = {
  woolworths: searchWoolworths,
  coles: searchColes,
  rejectshop: (q) =>
    searchShopify('https://www.therejectshop.com.au', q, 'rejectshop', 'The Reject Shop'),
  chemistwarehouse: searchChemistWarehouse,
  priceline: (q) =>
    searchFromHtml(
      `https://www.priceline.com.au/search?q=${encodeURIComponent(q)}`,
      'https://www.priceline.com.au',
      'priceline',
      'Priceline'
    ),
  terrywhite: (q) =>
    searchFromHtml(
      `https://www.terrywhitechemmart.com.au/search?q=${encodeURIComponent(q)}`,
      'https://www.terrywhitechemmart.com.au',
      'terrywhite',
      'Terry White'
    ),
  bunnings: (q) =>
    searchFromHtml(
      `https://www.bunnings.com.au/search/products?q=${encodeURIComponent(q)}`,
      'https://www.bunnings.com.au',
      'bunnings',
      'Bunnings'
    ),
  kmart: (q) =>
    searchFromHtml(
      `https://www.kmart.com.au/search?q=${encodeURIComponent(q)}`,
      'https://www.kmart.com.au',
      'kmart',
      'Kmart'
    ),
  target: (q) =>
    searchFromHtml(
      `https://www.target.com.au/search?text=${encodeURIComponent(q)}`,
      'https://www.target.com.au',
      'target',
      'Target'
    ),
  bigw: (q) =>
    searchFromHtml(
      `https://www.bigw.com.au/search?text=${encodeURIComponent(q)}`,
      'https://www.bigw.com.au',
      'bigw',
      'Big W'
    )
};

export function findSearchRetailer(id: string): SearchRetailer | undefined {
  return SEARCH_RETAILERS.find((shop) => shop.id === id);
}

export function googleShoppingUrl(query: string): string {
  return `https://www.google.com.au/search?tbm=shop&q=${encodeURIComponent(query)}`;
}

function shopBlockedMessage(): string {
  return 'This shop blocked the request. Open shop search in your browser.';
}

export async function searchRetailer(retailerId: string, query: string): Promise<ShopSearchResult> {
  const shop = findSearchRetailer(retailerId);
  if (!shop) {
    return {
      retailer: detectRetailer(retailerId) || retailerId,
      retailerId,
      results: [],
      fallbackUrl: '',
      error: 'Unknown shop.'
    };
  }

  const fallbackUrl = shop.fallbackUrl(query);
  const adapter = ADAPTERS[shop.id];

  if (!adapter) {
    return {
      retailer: shop.name,
      retailerId: shop.id,
      results: [],
      fallbackUrl,
      error: shopBlockedMessage()
    };
  }

  try {
    const results = await adapter(query);
    if (results.length === 0) {
      return {
        retailer: shop.name,
        retailerId: shop.id,
        results: [],
        fallbackUrl,
        error: 'No products came back. Open shop search in your browser.'
      };
    }
    return { retailer: shop.name, retailerId: shop.id, results, fallbackUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search failed.';
    const blocked = /403|401|429|blocked/i.test(message);
    return {
      retailer: shop.name,
      retailerId: shop.id,
      results: [],
      fallbackUrl,
      error: blocked ? shopBlockedMessage() : `${message} Open shop search in your browser.`
    };
  }
}
