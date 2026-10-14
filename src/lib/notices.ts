import type { CrawlEventView } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Routine notices (crawl started/finished, blocked, unavailable) read themselves after this. */
export const NOISE_AUTO_READ_MS = 3 * DAY_MS;

/** Notice groups older than this move under "Earlier" in the bell. */
export const EARLIER_AFTER_MS = 14 * DAY_MS;

export function eventTone(event: Pick<CrawlEventView, 'level' | 'message'>): string {
  const level = (event.level || 'info').toLowerCase();
  const msg = event.message.toLowerCase();
  if (level === 'error' || msg.includes('would not load') || msg.includes('looks dead')) {
    return 'error';
  }
  if (level === 'success' || (msg.includes('crawl finished') && msg.includes('no failures'))) {
    return 'success';
  }
  if (msg.includes('blocked our price check') || msg.includes('akamai') || /\bbot\b/.test(msg)) {
    return 'blocked';
  }
  if (msg.includes('unavailable')) {
    return 'stock';
  }
  if (level === 'warning' || msg.includes('could not find a price') || msg.includes('had trouble')) {
    return 'warning';
  }
  if (msg.startsWith('crawl started')) {
    return 'session';
  }
  return level === 'info' ? 'info' : level;
}

/**
 * Only per-link problems a person has to fix: dead links, pages that will not
 * load, missing prices, unsupported shops. Run summaries and bot walls are not.
 */
export function needsAction(event: Pick<CrawlEventView, 'level' | 'message' | 'linkId'>): boolean {
  if (!event.linkId) {
    return false;
  }
  const tone = eventTone(event);
  return tone === 'error' || tone === 'warning';
}

export function isStaleNoise(event: CrawlEventView, now: number): boolean {
  return !needsAction(event) && now - new Date(event.createdAt).getTime() > NOISE_AUTO_READ_MS;
}

export type LinkHealth = { isActive: boolean; checkedAt: string | null };

/**
 * A problem is over once the link is switched off, deleted, or the crawler
 * parsed it successfully (price or confirmed unavailable) after the notice.
 */
export function isResolved(event: CrawlEventView, links: Map<string, LinkHealth> | null): boolean {
  if (!links || !event.linkId || !needsAction(event)) {
    return false;
  }
  const link = links.get(event.linkId);
  if (!link || !link.isActive) {
    return true;
  }
  return Boolean(
    link.checkedAt && new Date(link.checkedAt).getTime() > new Date(event.createdAt).getTime()
  );
}
