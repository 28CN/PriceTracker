import { describe, expect, it } from 'vitest';

import { headlineFor, headlineText } from './cardState';

const money = (value: number) => `$${value.toFixed(2)}`;

describe('headlineFor', () => {
  it('shows a fresh price and ignores a queued recheck', () => {
    expect(headlineFor({ allUnavailable: false, price: 22.99, stalePrice: null, checkState: 'queued' }).kind).toBe(
      'price'
    );
  });

  it('keeps the last price when the check is old', () => {
    expect(headlineFor({ allUnavailable: false, price: null, stalePrice: 41.99, checkState: null }).kind).toBe(
      'stale'
    );
  });

  it('says checking soon only when a check is queued and there is no price', () => {
    expect(headlineText(headlineFor({ allUnavailable: false, price: null, stalePrice: null, checkState: 'queued' }), money)).toBe(
      'Checking soon'
    );
  });

  it('says checking only while a check is running', () => {
    expect(headlineText(headlineFor({ allUnavailable: false, price: null, stalePrice: null, checkState: 'checking' }), money)).toBe(
      'Checking…'
    );
  });

  it('does not call a missing price a queued check', () => {
    expect(headlineText(headlineFor({ allUnavailable: false, price: null, stalePrice: null, checkState: null }), money)).toBe(
      'No price yet'
    );
  });

  it('prefers a running check over a queued one', () => {
    expect(headlineFor({ allUnavailable: false, price: null, stalePrice: null, checkState: 'checking' }).kind).toBe(
      'checking'
    );
  });

  it('shows unavailable without inventing a price', () => {
    expect(headlineText(headlineFor({ allUnavailable: true, price: 10, stalePrice: null }), money)).toBe('Unavailable');
  });
});
