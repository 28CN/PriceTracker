import type { LinkView, ProductView } from './types';

/** Short stable hash so a changed image URL gets a fresh cache entry. */
function urlVersion(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i += 1) {
    hash = (hash * 31 + url.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

export type ThumbSource = {
  /** Resized, trimmed copy served by /api/thumb. */
  proxied: string;
  /** Original shop URL, used when the proxy fails in the browser. */
  raw: string;
};

export function productThumb(product: ProductView, pricedLinkId?: string | null): ThumbSource | null {
  if (product.imageUrl) {
    return {
      proxied: `/api/thumb?product=${encodeURIComponent(product.id)}&v=${urlVersion(product.imageUrl)}`,
      raw: product.imageUrl
    };
  }
  const link = pickProductImage(product.links, pricedLinkId);
  if (!link?.imageUrl) {
    return null;
  }
  return {
    proxied: `/api/thumb?link=${encodeURIComponent(link.id)}&v=${urlVersion(link.imageUrl)}`,
    raw: link.imageUrl
  };
}

/** Coles, then Woolworths, then Kmart, then Big W. */
const PREFERRED_SHOPS: RegExp[] = [
  /\bcoles\b|coles\./i,
  /\bwoolworths\b|woolworths\./i,
  /\bkmart\b|kmart\./i,
  /\bbig\s*w\b|bigw\./i
];

function shopRank(link: LinkView): number {
  const haystack = `${link.retailer} ${link.url}`;
  return PREFERRED_SHOPS.findIndex((pattern) => pattern.test(haystack));
}

function formatRank(url: string): number {
  const path = url.toLowerCase();
  if (path.includes('.png')) return 0;
  if (path.includes('.webp')) return 1;
  if (path.includes('.jpg') || path.includes('.jpeg')) return 2;
  return 3;
}

export function pickProductImage(links: LinkView[], pricedLinkId?: string | null): LinkView | null {
  const candidates = links.filter((link) => link.imageUrl);
  if (candidates.length === 0) {
    return null;
  }

  const preferred = candidates
    .filter((link) => shopRank(link) >= 0)
    .sort((a, b) => {
      const shop = shopRank(a) - shopRank(b);
      if (shop !== 0) return shop;
      return formatRank(a.imageUrl || '') - formatRank(b.imageUrl || '');
    });
  if (preferred.length > 0) {
    return preferred[0];
  }

  // Target, Bunnings, Repco, pharmacies, and the rest: the shop that supplied the price.
  if (pricedLinkId) {
    const priced = candidates.find((link) => link.id === pricedLinkId);
    if (priced) return priced;
  }

  const withPrice = candidates.find((link) => link.latestPrice !== null);
  return withPrice ?? candidates[0];
}
