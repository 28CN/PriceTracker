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
    id: 'bigw',
    name: 'Big W',
    defaultOn: false,
    fallbackUrl: (q) => `https://www.bigw.com.au/search?text=${encodeURIComponent(q)}`
  },
  {
    id: 'kmart',
    name: 'Kmart',
    defaultOn: false,
    fallbackUrl: (q) => `https://www.kmart.com.au/search?q=${encodeURIComponent(q)}`
  },
  {
    id: 'bunnings',
    name: 'Bunnings',
    defaultOn: false,
    fallbackUrl: (q) => `https://www.bunnings.com.au/search/products?q=${encodeURIComponent(q)}`
  },
  {
    id: 'rejectshop',
    name: 'The Reject Shop',
    defaultOn: false,
    fallbackUrl: (q) => `https://www.therejectshop.com.au/search?q=${encodeURIComponent(q)}`
  },
  {
    id: 'target',
    name: 'Target',
    defaultOn: false,
    fallbackUrl: (q) => `https://www.target.com.au/search?text=${encodeURIComponent(q)}`
  },
  {
    id: 'chemistwarehouse',
    name: 'Chemist Warehouse',
    defaultOn: false,
    fallbackUrl: (q) =>
      `https://www.chemistwarehouse.com.au/search?searchtext=${encodeURIComponent(q)}`
  },
  {
    id: 'priceline',
    name: 'Priceline',
    defaultOn: false,
    fallbackUrl: (q) => `https://www.priceline.com.au/search?q=${encodeURIComponent(q)}`
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
const FETCH_MS = 8000;
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
  return null;
}

function isProductUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes('/product') ||
    u.includes('productdetails') ||
    /\/products\//.test(u) ||
    /_p\d+/.test(u)
  );
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
    '';

  const urlRaw =
    (typeof record.url === 'string' && record.url) ||
    (typeof record.Url === 'string' && record.Url) ||
    (typeof record.productUrl === 'string' && record.productUrl) ||
    (typeof record.pdpUrl === 'string' && record.pdpUrl) ||
    (typeof record.seoToken === 'string' && record.seoToken) ||
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
    parseMoney(record.price) ??
    parseMoney(record.currentPrice) ??
    parseMoney(record.pricing) ??
    parseMoney(record.priceInfo);

  if (name && url && isProductUrl(url) && !seen.has(url)) {
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
  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
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
  const nextData = extractNextData(html);
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  if (nextData) {
    collectHits(nextData, origin, retailerId, retailerName, hits, seen);
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
  return hits;
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
    )
};

export function findSearchRetailer(id: string): SearchRetailer | undefined {
  return SEARCH_RETAILERS.find((shop) => shop.id === id);
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
      error: 'Search from this server is blocked. Open the shop search instead.'
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
        error: 'No products returned. Open the shop search to check.'
      };
    }
    return { retailer: shop.name, retailerId: shop.id, results, fallbackUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search failed.';
    return {
      retailer: shop.name,
      retailerId: shop.id,
      results: [],
      fallbackUrl,
      error: `${message} Open the shop search instead.`
    };
  }
}
