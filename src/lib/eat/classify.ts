/**
 * Reading an OzBargain fast-food deal title for /eat: where it is valid,
 * whether it needs the chain's app or membership, and whether it is food.
 */

export type EatRegion = 'wa' | 'national' | 'other';

const STATES = ['WA', 'NSW', 'VIC', 'QLD', 'SA', 'TAS', 'NT', 'ACT'] as const;
const OTHER_PLACES =
  /\b(sydney|melbourne|brisbane|adelaide|canberra|hobart|darwin|gold coast|sunshine coast|newcastle|geelong|wollongong|cairns|townsville|toowoomba|ballarat|bendigo)\b/i;
const WA_PLACES = /\b(western australia|perth|fremantle|joondalup|mandurah|rockingham|midland)\b/i;
const EXCLUDES_WA =
  /\b(excl(?:udes?|uding|\.)?|ex\.?|except|not (?:valid|available) in)\s+(?:[A-Z]{2,3}\s*[,/&]\s*)*WA\b/i;

function stateTokens(text: string): string[] {
  return (text.match(/\b[A-Z]{2,3}\b/g) ?? []).filter((t) => (STATES as readonly string[]).includes(t));
}

/** WA only, everywhere, or somewhere else only (dropped from the page). */
export function regionOf(title: string): EatRegion {
  if (EXCLUDES_WA.test(title)) return 'other';
  // [WA], [NSW, VIC], [SA, Woodville Park] ... at the start or anywhere in brackets.
  const tags = [...title.matchAll(/\[([^\]]{1,60})\]|\(([^)]{1,60})\)/g)].map((m) => m[1] ?? m[2]);
  const named = new Set(tags.flatMap(stateTokens));
  const only = [...title.matchAll(/\b(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\s+only\b/gi)].map((m) => m[1].toUpperCase());
  only.forEach((s) => named.add(s));
  if (named.size > 0) {
    if (named.has('WA')) return named.size === 1 ? 'wa' : 'national';
    return 'other';
  }
  if (WA_PLACES.test(title)) return 'wa';
  if (OTHER_PLACES.test(title)) return 'other';
  return 'national';
}

const APP =
  /\b(apps?|mymacca'?s|online\/app|members?(hip)?|rewards? members?|relish|gomex|zamfam|red royalty|flame rewards|flock rewards|peri[- ]?perks|account required|sign[- ]?up)\b/i;

/** Needs the chain's app, account or membership. */
export function needsApp(title: string): boolean {
  return APP.test(title.replace(/[’‘]/g, "'"));
}

const NOT_FOOD =
  /\b(rewards? points|points\b.*\b(for|@)|binge|travel|night package|dashpass|subscription|warcraft|bowling|gift ?cards?|merch only|perks\b(?!.*meal))/i;

/** Food, not points-for-travel or merch offers. */
export function isFoodDeal(title: string, category: string | null): boolean {
  if (category && !/dining|takeaway|food/i.test(category)) return false;
  return !NOT_FOOD.test(title);
}

/** Same chain and the same words before the "@": one card. */
export function dedupeKey(chain: string, title: string): string {
  const head = title.split(' @ ')[0] ?? title;
  const words = head
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9$.%]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1 && !['the', 'and', 'for', 'with', 'via', 'only'].includes(w));
  return `${chain}:${words.join(' ')}`;
}
