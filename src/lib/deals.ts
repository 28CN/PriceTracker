import { matchPreparedCandidate, normalizeSearchText, prepareCandidate, prepareQuery } from './searchMatch';
import { parseUnitSize } from './unitPrice';

export type DealTab = 'shops' | 'online';

/** One row of public.ozb_deals, as the page reads it. */
export type DealRow = {
  node_id: number;
  title: string;
  deal_url: string;
  shop: string;
  tab: DealTab;
  votes_pos: number;
  votes_neg: number;
  posted_at: string;
  starts_at: string | null;
  expires_at: string | null;
  first_seen_at: string;
  image_url: string | null;
};

export type FeedStatusRow = { shop: string; last_ok_at: string | null; last_attempt_at: string };

/** Shops with an OzBargain feed. Keys match crawler/deals.py FEEDS. */
export const DEAL_SHOPS: { key: string; name: string; domain: string; tab: DealTab }[] = [
  { key: 'coles', name: 'Coles', domain: 'coles.com.au', tab: 'shops' },
  { key: 'woolworths', name: 'Woolworths', domain: 'woolworths.com.au', tab: 'shops' },
  { key: 'kmart', name: 'Kmart', domain: 'kmart.com.au', tab: 'shops' },
  { key: 'target', name: 'Target', domain: 'target.com.au', tab: 'shops' },
  { key: 'bigw', name: 'Big W', domain: 'bigw.com.au', tab: 'shops' },
  { key: 'toymate', name: 'Toymate', domain: 'toymate.com.au', tab: 'shops' },
  { key: 'bunnings', name: 'Bunnings', domain: 'bunnings.com.au', tab: 'shops' },
  { key: 'chemistwarehouse', name: 'Chemist Warehouse', domain: 'chemistwarehouse.com.au', tab: 'shops' },
  { key: 'jbhifi', name: 'JB Hi-Fi', domain: 'jbhifi.com.au', tab: 'shops' },
  { key: 'amazon', name: 'Amazon AU', domain: 'amazon.com.au', tab: 'online' },
  { key: 'ebay', name: 'eBay', domain: 'ebay.com.au', tab: 'online' },
  { key: 'temu', name: 'Temu', domain: 'temu.com', tab: 'online' },
  { key: 'aliexpress', name: 'AliExpress', domain: 'aliexpress.com', tab: 'online' },
  { key: 'kogan', name: 'Kogan', domain: 'kogan.com', tab: 'online' }
];

export function dealShop(key: string) {
  return DEAL_SHOPS.find((shop) => shop.key === key) ?? null;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Still on: not flagged ended and not past its end date. */
export function isDealLive(deal: Pick<DealRow, 'expires_at'>, now: number): boolean {
  if (!deal.expires_at) return true;
  const end = Date.parse(deal.expires_at);
  return Number.isNaN(end) || end > now;
}

/** Posted in the last day. */
export function isNewDeal(deal: Pick<DealRow, 'posted_at'>, now: number): boolean {
  const posted = Date.parse(deal.posted_at);
  return !Number.isNaN(posted) && now - posted < DAY && now >= posted - HOUR;
}

/** "Ends in 5h", "Ends tomorrow", "Ends in 3 days", or null when open-ended. */
export function timeLeftLabel(expiresAt: string | null, now: number): string | null {
  if (!expiresAt) return null;
  const end = Date.parse(expiresAt);
  if (Number.isNaN(end)) return null;
  const left = end - now;
  if (left <= 0) return 'Ended';
  if (left < HOUR) return 'Ends soon';
  if (left < DAY) return `Ends in ${Math.round(left / HOUR)}h`;
  const days = Math.round(left / DAY);
  if (days <= 1) return 'Ends tomorrow';
  return `Ends in ${days} days`;
}

/** "Just now", "3h ago", "2 days ago". */
export function postedAgoLabel(postedAt: string, now: number): string {
  const posted = Date.parse(postedAt);
  if (Number.isNaN(posted)) return '';
  const age = Math.max(0, now - posted);
  if (age < HOUR) return 'Just now';
  if (age < DAY) return `${Math.floor(age / HOUR)}h ago`;
  const days = Math.floor(age / DAY);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}

// "$10 off", "$5 cashback", "spend $50" are conditions, not the price.
const NOT_A_PRICE_AFTER = /^\s*(off|cash\s?back|bonus|credit|gift|back|voucher|e?gift|store credit)\b/i;
const NOT_A_PRICE_BEFORE = /(spend|over|min\.?|minimum|orders?|first|of)\s*$/i;

/** The deal price from a title such as "Vegemite 380g $5.50 (Was $8) @ Coles". */
export function priceFromTitle(title: string): string | null {
  // Cashback offers carry caps and minimum spends, never an item price.
  if (/cash\s?back/i.test(title)) return null;
  const pattern = /\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g;
  for (const match of title.matchAll(pattern)) {
    const index = match.index ?? 0;
    const before = title.slice(Math.max(0, index - 12), index);
    const after = title.slice(index + match[0].length, index + match[0].length + 30);
    // A "$10 off" or "$5 cashback" deal has no single price.
    if (NOT_A_PRICE_AFTER.test(after)) return null;
    if (NOT_A_PRICE_BEFORE.test(before)) continue;
    // US$ prices: use the A$ figure that usually follows.
    if (/US\s*$/.test(before)) continue;
    if (/^\s*(delivery|delivered|shipping|postage|reg del)/i.test(after) && /\+\s*$/.test(before)) continue;
    // "$250+" or "$50 Click & Collect Spend" is a minimum spend.
    if (/^\+/.test(after) || /^\s?-\s?\$/.test(after) || /^\s*(?:[\w&]+\s+){0,3}(?:spend|order)\b/i.test(after)) continue;
    if (/^\s*\/\s?(mth|month|week|wk|yr|year)/i.test(after)) continue;
    if (/\bwas\s*$/i.test(before) || /\brrp\s*$/i.test(before)) continue;
    const amount = Number(match[1].replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    return `$${match[1]}`;
  }
  return null;
}

export type DealSaving = {
  /** The earlier price as written in the title, e.g. "$1.65". */
  was: string | null;
  /** Whole percent saved, from was vs now or a "58% off" in the title. */
  percent: number | null;
};

const toAmount = (raw: string) => Number(raw.replace(/[$,\s]/g, ''));

/**
 * Was-price and saving from the title: "(Was $1.65)", "RRP $75", "58% off",
 * "½ Price". Nothing is guessed: an estimate of the old price is never shown.
 */
export function savingFromTitle(title: string, price: string | null): DealSaving | null {
  const wasMatch = /\b(?:was|rrp|usually|normally)\b\s*:?\s*(\$\s?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\$\s?\d+(?:\.\d{1,2})?)/i.exec(
    title
  );
  const now = price ? toAmount(price) : NaN;
  if (wasMatch && Number.isFinite(now)) {
    const was = toAmount(wasMatch[1]);
    if (was > now && now > 0) {
      return { was: `$${wasMatch[1].replace(/[$\s]/g, '')}`, percent: Math.round(((was - now) / was) * 100) };
    }
  }
  if (!price) return null;
  const percentMatch = /(\d{1,2})\s?%\s?off\b/i.exec(title);
  if (percentMatch) {
    const percent = Number(percentMatch[1]);
    if (percent > 0 && percent < 100) return { was: null, percent };
  }
  if (/(?:½|\bhalf)\s?price\b/i.test(title)) return { was: null, percent: 50 };
  return null;
}

/**
 * True when a deal and a tracked product are the same size, so their prices
 * can be compared: both sizes read the same, or neither name has one.
 */
export function sameSize(productName: string, dealTitle: string): boolean {
  const a = parseUnitSize(productName);
  const b = parseUnitSize(dealTitle.replace(/\$\s?\d[\d,.]*/g, ' '));
  if (!a && !b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

const STOP_WORDS = new Set(['the', 'and', 'with', 'for', 'pack', 'of', 'x', 'new']);

/** Words that say what the product is: no sizes, counts or filler. */
function coreWords(name: string): string[] {
  return normalizeSearchText(name)
    .split(' ')
    .filter((word) => word.length >= 2 && !/\d/.test(word) && !STOP_WORDS.has(word))
    .slice(0, 5);
}

/**
 * Which tracked product a deal is about, if any. Every core word of the name
 * must appear in the deal title (light typos allowed); if that fails, the name
 * without its first word (often the brand) is tried when 2+ words remain.
 */
export function matchDealsToProducts(
  deals: readonly Pick<DealRow, 'node_id' | 'title'>[],
  products: readonly { id: string; name: string }[]
): Map<number, { id: string; name: string }> {
  const queries = products
    .map(({ id, name }) => {
      const words = coreWords(name);
      const tries = [words];
      if (words.length >= 3) tries.push(words.slice(1));
      return {
        product: { id, name },
        prepared: tries
          .filter((tryWords) => tryWords.length >= 2)
          .map((tryWords) => prepareQuery(tryWords.join(' ')))
          .filter((query) => query !== null)
      };
    })
    .filter((entry) => entry.prepared.length > 0);

  const matches = new Map<number, { id: string; name: string }>();
  for (const deal of deals) {
    const candidate = prepareCandidate({ name: deal.title });
    for (const entry of queries) {
      const hit = entry.prepared.some((query) => {
        const match = matchPreparedCandidate(query, candidate);
        return match !== null && match.kind !== 'fuzzy';
      });
      if (hit) {
        matches.set(deal.node_id, entry.product);
        break;
      }
    }
  }
  return matches;
}

/** "just now", "12 min ago", "2 hr ago", "3 days ago": when the feeds were last read. */
export function updatedAgoLabel(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 2) return 'just now';
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}
