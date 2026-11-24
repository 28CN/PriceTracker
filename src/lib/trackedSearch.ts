import { resolveCardPrice } from './cardState';
import { productThumb, type ThumbSource } from './productImage';
import { compactSearchText, type SearchCandidate } from './searchMatch';
import type { ProductView } from './types';

export type TrackedSearchItem = {
  id: string;
  name: string;
  shops: string[];
  /** List group (category) name, e.g. "Hotwheels". */
  groups: string[];
  /** Brand and product words taken from the shop links, e.g. "hot wheels super rig". */
  linkWords: string[];
  /** Leading shop name to display beside the price. */
  shop: string | null;
  /** Cheapest fresh price, or null when only stale / unavailable / missing. */
  price: number | null;
  /** Newest stale price when no fresh price exists (never hidden behind a click). */
  stalePrice: number | null;
  lastSeenAt: string | null;
  thumb: ThumbSource | null;
  urls: string[];
};

// Words in shop URLs that say nothing about the product itself.
const GENERIC_URL_WORDS = new Set([
  'shop', 'product', 'products', 'productdetails', 'p', 'item', 'items', 'buy', 'www', 'html',
  'assorted', 'asst', 'each', 'styles', 'vary', 'pack', 'the', 'and', 'with', 'for'
]);

/** Product words from a shop link's path, e.g. ".../p/hot-wheels-super-rig-assorted/123" -> "hot wheels super rig". */
export function linkPathWords(url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return '';
  }
  const words: string[] = [];
  for (const segment of path.split('/')) {
    for (const word of decodeURIComponent(segment).toLowerCase().split(/[^a-z]+/)) {
      if (word.length >= 3 && !GENERIC_URL_WORDS.has(word) && !words.includes(word)) words.push(word);
    }
  }
  return words.join(' ');
}

export function toTrackedSearchItem(product: ProductView): TrackedSearchItem {
  const cardPrice = resolveCardPrice({
    links: product.links,
    checkState: product.checkState
  });
  const cheapestFresh = cardPrice.cheapestFreshLink;
  const headlineLink = cardPrice.headlineLink;

  const shopSet = new Set<string>();
  const urls: string[] = [];
  for (const link of product.links) {
    if (link.retailer) shopSet.add(link.retailer);
    if (link.url) urls.push(link.url);
  }
  const shops = [...shopSet];
  const linkWords = [...new Set(urls.map(linkPathWords).filter(Boolean))];

  return {
    id: product.id,
    name: product.name,
    shops,
    groups: product.categoryName ? [product.categoryName] : [],
    linkWords,
    shop: cheapestFresh?.retailer ?? headlineLink?.retailer ?? shops[0] ?? null,
    price: cheapestFresh?.latestPrice ?? null,
    stalePrice: cardPrice.headline.kind === 'stale' ? cardPrice.headline.price : null,
    lastSeenAt: cardPrice.headline.kind === 'stale' ? cardPrice.headline.lastSeenAt : null,
    thumb: productThumb(product, headlineLink?.id ?? cheapestFresh?.id),
    urls
  };
}

export function toTrackedSearchItems(products: readonly ProductView[]): TrackedSearchItem[] {
  return products.map(toTrackedSearchItem);
}

// Common Australian shop nicknames/shorthands mapped to canonical compact shop keys.
const SHOP_ALIASES: readonly [string, string][] = [
  ['woolworths', 'woolies'],
  ['woolies', 'woolworths'],
  ['bigw', 'big w'],
  ['jbhifi', 'jb'],
  ['jbhifi', 'jb hi-fi'],
  ['chemistwarehouse', 'chemist']
];

function shopAliasesFor(shops: readonly string[]): string[] {
  const extra: string[] = [];
  for (const shop of shops) {
    const compact = compactSearchText(shop);
    if (!compact) continue;
    for (const [key, alias] of SHOP_ALIASES) {
      if ((compact === key || compact.startsWith(key)) && !extra.includes(alias)) {
        extra.push(alias);
      }
    }
  }
  return extra;
}

/** What the instant list search matches on: title, then group/tag, then shops and link words. */
export function trackedSearchCandidate(item: TrackedSearchItem): SearchCandidate {
  return {
    name: item.name,
    groups: item.groups,
    shops: [...item.shops, ...shopAliasesFor(item.shops), ...item.linkWords]
  };
}
