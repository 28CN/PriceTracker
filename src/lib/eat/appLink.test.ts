import { describe, expect, it } from 'vitest';

import { appLinkFor, detectPlatform } from './appLink';
import { eatChain } from './chains';

describe('appLinkFor', () => {
  it('builds the exact Android intent link for McDonalds with web fallback', () => {
    const mcdonalds = eatChain('mcdonalds');
    expect(mcdonalds).not.toBeNull();
    expect(appLinkFor(mcdonalds!, 'android')).toBe(
      'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.mcdonalds.au.gma;S.browser_fallback_url=https%3A%2F%2Fwww.mcdonalds.com%2Fau%2Fen-au%2Fmymaccas-rewards.html;end'
    );
  });

  it('uses the universal link on iOS for Subway and App Store fallback for KFC', () => {
    const subway = eatChain('subway');
    const kfc = eatChain('kfc');
    expect(subway).not.toBeNull();
    expect(kfc).not.toBeNull();
    expect(appLinkFor(subway!, 'ios')).toBe('https://app.subcard.com.au/ul/page/order');
    expect(appLinkFor(kfc!, 'ios')).toBe('https://apps.apple.com/au/app/id725748250');
  });

  it('returns the official web url on desktop and for chains without app metadata', () => {
    const hj = eatChain('hungryjacks');
    const subway = eatChain('subway');
    const dominos = eatChain('dominos');
    expect(appLinkFor(hj!, 'other')).toBe('https://www.hungryjacks.com.au/vouchers');
    expect(appLinkFor(subway!, 'other')).toBe('https://www.subway.com/en-au/promotions');
    expect(appLinkFor(dominos!, 'android')).toBe('https://www.dominos.com.au/offers');
    expect(appLinkFor(dominos!, 'ios')).toBe('https://www.dominos.com.au/offers');
  });
});

describe('detectPlatform', () => {
  it('detects Android, iOS, iPadOS and desktop user agents', () => {
    expect(
      detectPlatform(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
        5
      )
    ).toBe('android');
    expect(
      detectPlatform(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        5
      )
    ).toBe('ios');
    expect(
      detectPlatform(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
        5
      )
    ).toBe('ios');
    expect(
      detectPlatform(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        0
      )
    ).toBe('other');
    expect(
      detectPlatform(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        0
      )
    ).toBe('other');
  });
});
