import type { StockStatus } from './types';

export type CheckState = 'queued' | 'checking';

export type CardOffer = {
  id: string;
  retailer: string;
  isActive: boolean;
  stockStatus: StockStatus;
  latestPrice: number | null;
  priceStale: boolean;
  latestAt: string | null;
  url?: string | null;
};

export type Headline =
  | { kind: 'unavailable' }
  | { kind: 'price'; price: number }
  | { kind: 'stale'; price: number; lastSeenAt: string | null }
  | { kind: 'checking' }
  | { kind: 'queued' }
  | { kind: 'none' };

export type CardPriceDecision<T extends CardOffer = CardOffer> = {
  headline: Headline;
  /** Winning shop for the card headline: cheapest fresh offer, or newest stale offer when none are fresh. */
  headlineLink: T | null;
  /** Cheapest active fresh offer; null when no fresh prices exist. A stale price never wins Cheapest. */
  cheapestFreshLink: T | null;
  /** Active fresh offers with valid prices, used for shop-gap comparisons. */
  freshOffers: { retailer: string; price: number; url?: string | null }[];
  allUnavailable: boolean;
  isStale: boolean;
};

function toTimestamp(iso: string | null): number {
  if (!iso) return -Infinity;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? -Infinity : ms;
}

/**
 * One line for the price rail.
 * A saved price wins over a check that is still running.
 * "Checking soon" and "Checking…" are only used when there is no price,
 * and only when a crawl job is actually waiting or running.
 */
export function headlineFor(input: {
  allUnavailable: boolean;
  price: number | null;
  stalePrice: number | null;
  staleAt?: string | null;
  checkState?: CheckState | null;
}): Headline {
  if (input.allUnavailable) return { kind: 'unavailable' };
  if (input.price !== null) return { kind: 'price', price: input.price };
  if (input.stalePrice !== null) {
    return { kind: 'stale', price: input.stalePrice, lastSeenAt: input.staleAt ?? null };
  }
  if (input.checkState === 'checking') return { kind: 'checking' };
  if (input.checkState === 'queued') return { kind: 'queued' };
  return { kind: 'none' };
}

/**
 * Decide which shop and price lead a product card.
 * Fresh prices always beat stale prices for "Cheapest" and the headline, even if higher.
 * If only stale prices exist, the newest stale observation leads, flagged as stale.
 */
export function resolveCardPrice<T extends CardOffer>(input: {
  links: T[];
  checkState?: CheckState | null;
}): CardPriceDecision<T> {
  const activeLinks = input.links.filter((link) => link.isActive);
  const allUnavailable =
    activeLinks.length > 0 && activeLinks.every((link) => link.stockStatus === 'unavailable');

  if (allUnavailable) {
    return {
      headline: { kind: 'unavailable' },
      headlineLink: null,
      cheapestFreshLink: null,
      freshOffers: [],
      allUnavailable: true,
      isStale: false
    };
  }

  let cheapestFreshLink: T | null = null;
  let newestStaleLink: T | null = null;
  const freshOffers: { retailer: string; price: number; url?: string | null }[] = [];

  for (const link of activeLinks) {
    if (link.stockStatus === 'unavailable') continue;
    if (link.latestPrice === null || !Number.isFinite(link.latestPrice)) continue;

    if (!link.priceStale) {
      freshOffers.push(
        link.url ? { retailer: link.retailer, price: link.latestPrice, url: link.url } : { retailer: link.retailer, price: link.latestPrice }
      );
      if (
        !cheapestFreshLink ||
        link.latestPrice < (cheapestFreshLink.latestPrice as number) ||
        (link.latestPrice === cheapestFreshLink.latestPrice &&
          toTimestamp(link.latestAt) > toTimestamp(cheapestFreshLink.latestAt))
      ) {
        cheapestFreshLink = link;
      }
      continue;
    }

    if (!newestStaleLink) {
      newestStaleLink = link;
      continue;
    }

    const linkTs = toTimestamp(link.latestAt);
    const bestTs = toTimestamp(newestStaleLink.latestAt);
    if (
      linkTs > bestTs ||
      (linkTs === bestTs && link.latestPrice < (newestStaleLink.latestPrice as number))
    ) {
      newestStaleLink = link;
    }
  }

  const headlineLink = cheapestFreshLink ?? newestStaleLink;
  const headline = headlineFor({
    allUnavailable: false,
    price: cheapestFreshLink?.latestPrice ?? null,
    stalePrice: cheapestFreshLink ? null : (newestStaleLink?.latestPrice ?? null),
    staleAt: cheapestFreshLink ? null : (newestStaleLink?.latestAt ?? null),
    checkState: input.checkState
  });

  return {
    headline,
    headlineLink,
    cheapestFreshLink,
    freshOffers,
    allUnavailable: false,
    isStale: headline.kind === 'stale'
  };
}

export type ShopGapDetail = {
  /** Dearest fresh shop name. */
  retailer: string;
  /** Optional shop URL when supplied on the offer. */
  url?: string | null;
  /** Price difference above the cheapest fresh offer. */
  gap: number;
  /** Number of priced fresh offers compared. */
  offerCount: number;
  /** Full accessible sentence, matching shopGapLabel. */
  label: string;
};

/** Structured details for the gap between cheapest and dearest current shops. */
export function shopGapDetail(
  offers: { retailer: string; price: number; url?: string | null }[],
  money: (value: number) => string
): ShopGapDetail | null {
  const priced = offers.filter((offer) => Number.isFinite(offer.price));
  if (priced.length < 2) return null;
  let low = priced[0];
  let high = priced[0];
  for (const offer of priced) {
    if (offer.price < low.price) low = offer;
    if (offer.price > high.price) high = offer;
  }
  const gap = high.price - low.price;
  if (gap < 0.01) return null;
  const amount = money(gap);
  const label =
    priced.length === 2
      ? `${high.retailer} is ${amount} more`
      : `The highest shop is ${amount} more`;
  return {
    retailer: high.retailer,
    url: high.url,
    gap,
    offerCount: priced.length,
    label
  };
}

/** How much more the dearest current shop is, compared with the cheapest. Not the goal. */
export function shopGapLabel(
  offers: { retailer: string; price: number }[],
  money: (value: number) => string
): string | null {
  const priced = offers.filter((offer) => Number.isFinite(offer.price));
  if (priced.length < 2) return null;
  let low = priced[0];
  let high = priced[0];
  for (const offer of priced) {
    if (offer.price < low.price) low = offer;
    if (offer.price > high.price) high = offer;
  }
  const gap = high.price - low.price;
  if (gap < 0.01) return null;
  const amount = money(gap);
  if (priced.length === 2) return `${high.retailer} is ${amount} more`;
  return `The highest shop is ${amount} more`;
}

export function headlineText(headline: Headline, money: (value: number) => string): string {
  switch (headline.kind) {
    case 'unavailable':
      return 'Unavailable';
    case 'price':
    case 'stale':
      return money(headline.price);
    case 'checking':
      return 'Checking…';
    case 'queued':
      return 'Checking soon';
    case 'none':
      return 'No price yet';
  }
}
