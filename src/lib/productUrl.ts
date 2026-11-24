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

// Any of these in the path means a page of many products.
const LISTING_ANYWHERE = new Set(['search', 'browse', 'specials', 'on-special', 'half-price']);

// Toymate pages that are one slug but list many products.
const TOYMATE_LISTING_SLUGS = new Set([
  'pre-order-coming-soon',
  'outdoor-games-sports',
  'water-sand-play',
  'order-tracking-form',
  'terms-conditions',
  'privacy-policy',
  'returns-exchange',
  'help-centre',
  'store-finder',
  'gift-cards'
]);

/**
 * Toymate products live at one slug: /bluey-8-inch-plush-s1/. Its groups
 * are short slugs (/paw-patrol/) or nested (/brand-shop/bluey/bluey-plush/).
 */
function looksLikeToymateProduct(parts: string[]): boolean {
  if (parts.length !== 1) return false;
  const slug = parts[0];
  if (TOYMATE_LISTING_SLUGS.has(slug)) return false;
  const words = slug.split('-').filter(Boolean);
  return words.length >= 4 || (words.length >= 2 && /\d/.test(slug));
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
  if (parts.some((part) => LISTING_ANYWHERE.has(part))) return false;
  if (/(^|\.)toymate\.com\.au$/.test(url.hostname)) return looksLikeToymateProduct(parts);
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

/** The first http(s) link inside shared text, e.g. "Look at this https://…". */
export function firstUrlIn(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;
  return cleanHttpUrl(match[0].replace(/[),.;!?]+$/, ''));
}
