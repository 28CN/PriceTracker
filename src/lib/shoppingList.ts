import { resolveCardPrice } from './cardState';
import { detectRetailer, retailerKey } from './retailer';
import { matchPreparedCandidate, prepareCandidate, prepareQuery } from './searchMatch';
import { toTrackedSearchItem, trackedSearchCandidate } from './trackedSearch';
import type { LinkView, ProductView } from './types';

/**
 * A shop only "sells" a product when it gave us a price this recently.
 * A saved link alone does not count: shops quietly stop stocking things.
 */
export const SHOP_RECENT_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export type LowestRow = {
  product: ProductView;
  /** Lowest current price, or the newest old price when nothing is current. */
  price: number | null;
  link: LinkView | null;
  /** Every shop with the same lowest current price, cheapest link first. */
  retailers: string[];
  stale: boolean;
  lastSeenAt: string | null;
  belowGoal: boolean;
  unavailable: boolean;
};

export type LowestSort = 'deals' | 'name';

function byName(a: ProductView, b: ProductView): number {
  return a.name.localeCompare(b.name, 'en-AU', { sensitivity: 'base' });
}

function goalRatio(price: number | null, goal: number | null): number {
  if (price === null || goal === null || goal <= 0) return Infinity;
  return price / goal;
}

/** One row per tracked product with its single lowest price and where to get it. */
export function lowestPriceRows(products: ProductView[], sort: LowestSort = 'deals'): LowestRow[] {
  const rows = products.map((product): LowestRow => {
    const decision = resolveCardPrice({ links: product.links, checkState: product.checkState });
    const link = decision.headlineLink;
    const price = link?.latestPrice ?? null;
    const stale = decision.isStale;
    const retailers = link ? [link.retailer] : [];
    if (link && !stale) {
      for (const offer of decision.freshOffers) {
        if (offer.price === price && !retailers.includes(offer.retailer)) retailers.push(offer.retailer);
      }
    }
    return {
      product,
      price,
      link,
      retailers,
      stale,
      lastSeenAt: stale ? (link?.latestAt ?? null) : null,
      belowGoal: !stale && price !== null && product.targetPrice !== null && price <= product.targetPrice,
      unavailable: decision.allUnavailable
    };
  });

  return rows.sort((a, b) => {
    if (sort === 'deals') {
      if (a.belowGoal !== b.belowGoal) return a.belowGoal ? -1 : 1;
      // Fresh prices before old ones, nothing-known last.
      const rank = (row: LowestRow) => (row.price === null ? 2 : row.stale ? 1 : 0);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      const ratio = goalRatio(a.price, a.product.targetPrice) - goalRatio(b.price, b.product.targetPrice);
      if (Number.isFinite(ratio) && ratio !== 0) return ratio;
    }
    return byName(a.product, b.product);
  });
}

/** Stable key for grouping links by shop, from the URL first, then the name. */
export function shopKeyFor(link: Pick<LinkView, 'retailer' | 'url'>): string {
  return (
    retailerKey(link.url) ??
    retailerKey(link.retailer) ??
    link.retailer.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
  );
}

/** The shop's proper name for a known website ("The Reject Shop", not "Rejectshop"). */
export function shopNameFor(link: Pick<LinkView, 'retailer' | 'url'>): string {
  return retailerKey(link.url) ? detectRetailer(link.url) : link.retailer;
}

/** True when this link gave us a price within the window and is not marked sold out. */
export function isRecentlySold(link: LinkView, now: number = Date.now(), days = SHOP_RECENT_DAYS): boolean {
  if (!link.isActive || link.stockStatus === 'unavailable') return false;
  if (link.latestPrice === null || !Number.isFinite(link.latestPrice)) return false;
  if (!link.latestAt) return false;
  const at = new Date(link.latestAt).getTime();
  if (Number.isNaN(at)) return false;
  return now - at <= days * DAY_MS;
}

export type ShopItem = {
  product: ProductView;
  link: LinkView;
  price: number;
  /** Older than a week: show muted with Last seen. */
  stale: boolean;
  belowGoal: boolean;
  /** No other shop has it cheaper right now (ties count). Only set when another shop has a price too. */
  cheapest: boolean;
};

export type ShopGroup = {
  key: string;
  name: string;
  /** A link to use for the shop logo. */
  sampleUrl: string;
  items: ShopItem[];
};

/**
 * Every shop the user has links for, with the tracked products that shop is
 * selling now (a price within the window). Shops with no recent price still
 * appear, with no items, so the user can see why.
 */
export function shopGroups(products: ProductView[], now: number = Date.now(), days = SHOP_RECENT_DAYS): ShopGroup[] {
  const groups = new Map<string, ShopGroup>();

  for (const product of products) {
    // Lowest recent price per shop for this product.
    const perShop = new Map<string, LinkView>();
    for (const link of product.links) {
      if (!link.isActive) continue;
      const key = shopKeyFor(link);
      if (!groups.has(key)) groups.set(key, { key, name: shopNameFor(link), sampleUrl: link.url, items: [] });
      if (!isRecentlySold(link, now, days)) continue;
      const best = perShop.get(key);
      if (
        !best ||
        (link.latestPrice as number) < (best.latestPrice as number) ||
        (link.latestPrice === best.latestPrice && (link.latestAt ?? '') > (best.latestAt ?? ''))
      ) {
        perShop.set(key, link);
      }
    }

    // An old price never wins "cheapest", same as on the cards.
    const current = [...perShop.values()].filter((link) => !link.priceStale);
    const floor = current.length > 0 ? Math.min(...current.map((link) => link.latestPrice as number)) : null;
    for (const [key, link] of perShop) {
      const price = link.latestPrice as number;
      groups.get(key)!.items.push({
        product,
        link,
        price,
        stale: link.priceStale,
        belowGoal: !link.priceStale && product.targetPrice !== null && price <= product.targetPrice,
        cheapest: !link.priceStale && perShop.size > 1 && floor !== null && price <= floor
      });
    }
  }

  const list = [...groups.values()];
  for (const group of list) {
    group.items.sort((a, b) => {
      if (a.belowGoal !== b.belowGoal) return a.belowGoal ? -1 : 1;
      if (a.cheapest !== b.cheapest) return a.cheapest ? -1 : 1;
      if (a.stale !== b.stale) return a.stale ? 1 : -1;
      return byName(a.product, b.product);
    });
  }
  return list.sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name, 'en-AU'));
}

/** Filter tracked products with the dashboard search matcher, keeping original order. */
export function filterProductsByQuery(products: readonly ProductView[], query: string): ProductView[] {
  const trimmed = query.trim();
  if (!trimmed) return [...products];
  const preparedQuery = prepareQuery(trimmed);
  if (!preparedQuery) return [];
  return products.filter((product) => {
    const candidate = trackedSearchCandidate(toTrackedSearchItem(product));
    return matchPreparedCandidate(preparedQuery, prepareCandidate(candidate)) !== null;
  });
}

/** Coles and Woolworths start their new specials every Wednesday. */
export function hasWednesdaySpecials(shopKey: string | null | undefined): boolean {
  return shopKey === 'coles' || shopKey === 'woolworths';
}

/** Sum of the prices shown for one shop: what the whole list would cost there. */
export function shopTotal(items: readonly ShopItem[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.price, 0) * 100) / 100;
}

type Money = (value: number) => string;
type Day = (iso: string) => string;

/** Plain text of the Lowest prices tab, for sharing or pasting into a note. */
export function lowestListText(rows: readonly LowestRow[], money: Money, day: Day): string {
  const lines = rows.map((row) => {
    if (row.price === null) return `- ${row.product.name}: ${row.unavailable ? 'unavailable' : 'no price yet'}`;
    const where = row.retailers.length > 0 ? ` at ${row.retailers.join(' or ')}` : '';
    const old = row.stale && row.lastSeenAt ? ` (last seen ${day(row.lastSeenAt)})` : '';
    return `- ${row.product.name}: ${money(row.price)}${where}${old}`;
  });
  return ['Shopping list: lowest prices', ...lines].join('\n');
}

/** Plain text of one shop's list with its total. */
export function shopListText(group: Pick<ShopGroup, 'name'>, items: readonly ShopItem[], money: Money, day: Day): string {
  const lines = items.map((item) => {
    const old = item.stale && item.link.latestAt ? ` (last seen ${day(item.link.latestAt)})` : '';
    return `- ${item.product.name}: ${money(item.price)}${old}`;
  });
  return [`Shopping list: ${group.name}`, ...lines, `Total ${money(shopTotal(items))}`].join('\n');
}
