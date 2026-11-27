import type { EatChain } from './chains';

export type Platform = 'android' | 'ios' | 'other';

export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) {
    return 'ios';
  }
  return 'other';
}

export function appLinkFor(chain: Pick<EatChain, 'url' | 'app'>, platform: Platform): string {
  if (!chain.app || platform === 'other') return chain.url;
  if (platform === 'android') {
    return `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${chain.app.android};S.browser_fallback_url=${encodeURIComponent(chain.url)};end`;
  }
  return chain.app.iosLink ?? `https://apps.apple.com/au/app/id${chain.app.iosId}`;
}
