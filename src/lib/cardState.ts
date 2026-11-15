export type CheckState = 'queued' | 'checking';

export type Headline =
  | { kind: 'unavailable' }
  | { kind: 'price'; price: number }
  | { kind: 'stale'; price: number }
  | { kind: 'checking' }
  | { kind: 'queued' }
  | { kind: 'none' };

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
  checkState?: CheckState | null;
}): Headline {
  if (input.allUnavailable) return { kind: 'unavailable' };
  if (input.price !== null) return { kind: 'price', price: input.price };
  if (input.stalePrice !== null) return { kind: 'stale', price: input.stalePrice };
  if (input.checkState === 'checking') return { kind: 'checking' };
  if (input.checkState === 'queued') return { kind: 'queued' };
  return { kind: 'none' };
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
      return money(headline.price);
    case 'stale':
      return 'Show last price';
    case 'checking':
      return 'Checking…';
    case 'queued':
      return 'Checking soon';
    case 'none':
      return 'No price yet';
  }
}
