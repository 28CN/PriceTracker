import type { LinkView } from './types';

/** Costco, then UWS, then Kmart, then Big W. Everything else follows add order. */
const PREFERRED_SHOPS: RegExp[] = [
  /\bcostco\b|\bcost\b|costco\./i,
  /\buws\b|uws\./i,
  /\bkmart\b|kmart\./i,
  /\bbig\s*w\b|bigw\./i
];

function shopRank(link: LinkView): number {
  const haystack = `${link.retailer} ${link.url}`;
  const index = PREFERRED_SHOPS.findIndex((pattern) => pattern.test(haystack));
  return index === -1 ? PREFERRED_SHOPS.length : index;
}

function formatRank(url: string): number {
  const path = url.toLowerCase();
  if (path.includes('.png')) return 0;
  if (path.includes('.webp')) return 1;
  if (path.includes('.jpg') || path.includes('.jpeg')) return 2;
  return 3;
}

export function pickProductImage(links: LinkView[]): LinkView | null {
  const candidates = links.filter((link) => link.imageUrl);
  if (candidates.length === 0) {
    return null;
  }

  const ranked = [...candidates].sort((a, b) => {
    const shop = shopRank(a) - shopRank(b);
    if (shop !== 0) return shop;
    const format = formatRank(a.imageUrl || '') - formatRank(b.imageUrl || '');
    if (format !== 0) return format;
    const aTime = a.createdAt || '';
    const bTime = b.createdAt || '';
    if (aTime !== bTime) return aTime < bTime ? -1 : 1;
    return a.retailer.localeCompare(b.retailer);
  });

  return ranked[0];
}
