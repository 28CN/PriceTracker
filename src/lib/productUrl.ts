import { hasCrawlerSupport } from '@/lib/retailer';

const TRACKING_PREFIXES = ['utm_'];
const TRACKING_KEYS = new Set([
  'gclid',
  'gclsrc',
  'dclid',
  'fbclid',
  'msclkid',
  'srsltid',
  'mc_cid',
  'mc_eid',
  '_ga',
  'yclid',
  'twclid'
]);

const LISTING_PREFIXES = [
  '/search/',
  '/s/',
  '/category/',
  '/categories/',
  '/collections/',
  '/c/',
  '/brands/',
  '/brand/',
  '/catalogue/',
  '/catalog/'
];

const LISTING_SEGMENTS = new Set([
  'search',
  'shop',
  'store',
  'stores',
  'specials',
  'deals',
  'catalogue',
  'catalog'
]);

export function cleanHttpUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()]) {
    const name = key.toLowerCase();
    if (TRACKING_KEYS.has(name) || TRACKING_PREFIXES.some((prefix) => name.startsWith(prefix))) {
      url.searchParams.delete(key);
    }
  }
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

export function looksLikeProductPage(raw: string): boolean {
  const cleaned = cleanHttpUrl(raw);
  if (!cleaned) return false;
  const url = new URL(cleaned);
  const path = url.pathname.toLowerCase();
  if (path === '/' || path === '') return false;
  if (LISTING_PREFIXES.some((prefix) => path.startsWith(prefix))) return false;
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 1 && LISTING_SEGMENTS.has(parts[0])) return false;
  if (
    path.includes('/product') ||
    path.includes('/products/') ||
    path.includes('/p/') ||
    path.includes('/pd/') ||
    path.includes('/buy/')
  ) {
    return true;
  }
  const leaf = parts[parts.length - 1] || '';
  return parts.length >= 2 && leaf.length >= 6;
}

export function isTrackableSearchUrl(raw: string): boolean {
  const cleaned = cleanHttpUrl(raw);
  return Boolean(cleaned && hasCrawlerSupport(cleaned) && looksLikeProductPage(cleaned));
}
