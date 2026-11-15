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
