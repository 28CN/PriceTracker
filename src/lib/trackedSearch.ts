import { resolveCardPrice } from './cardState';
import { productThumb, type ThumbSource } from './productImage';
import type { ProductView } from './types';

export type TrackedSearchItem = {
  id: string;
  name: string;
  shops: string[];
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

  return {
    id: product.id,
    name: product.name,
    shops,
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
