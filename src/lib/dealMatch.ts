import { brandInTitle, brandsForProducts, phrasePattern, type DealBrand } from '@/lib/dealBrands';
import { matchDealsToProducts, type DealRow } from '@/lib/deals';
import { normalizeSearchText } from '@/lib/searchMatch';
import type { ProductView } from '@/lib/types';

export type BrandState = 'follow' | 'mute';
export type BrandPref = { key: string; label: string; state: BrandState };

export type DealMatch =
  | { kind: 'item'; id: string; label: string }
  | { kind: 'brand'; key: string; label: string; followed: boolean };

/** Stored key for a brand label: "Arnott's" -> "arnott s". Null when nothing usable is left. */
export function brandKey(label: string): string | null {
  const key = normalizeSearchText(label)
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
    .trim();
  return key || null;
}

/**
 * Brands to match for one person: brands behind their items, minus muted
 * ones, plus followed ones even when nothing on the list names them.
 */
export function brandsWithPrefs(brands: readonly DealBrand[], prefs: readonly BrandPref[]): DealBrand[] {
  const muted = new Set(prefs.filter((pref) => pref.state === 'mute').map((pref) => pref.key));
  const kept = brands.filter((brand) => !muted.has(brandKey(brand.label) ?? ''));
  for (const pref of prefs) {
    if (pref.state !== 'follow' || kept.some((brand) => brandKey(brand.label) === pref.key)) continue;
    const pattern = phrasePattern(pref.label);
    if (pattern) kept.push({ label: pref.label, pattern });
  }
  return kept;
}

/** Exact items first; otherwise a brand or show on the list (not muted) or followed. */
export function matchDeals(
  deals: readonly Pick<DealRow, 'node_id' | 'title'>[],
  products: readonly ProductView[],
  prefs: readonly BrandPref[]
): Map<number, DealMatch> {
  const result = new Map<number, DealMatch>();
  if (!products.length && !prefs.some((pref) => pref.state === 'follow')) return result;

  const items = products.length ? matchDealsToProducts(deals, products) : new Map<number, { id: string; name: string }>();
  const brands = brandsWithPrefs(products.length ? brandsForProducts(products) : [], prefs);
  const followed = new Set(prefs.filter((pref) => pref.state === 'follow').map((pref) => pref.key));

  for (const deal of deals) {
    const item = items.get(deal.node_id);
    if (item) {
      result.set(deal.node_id, { kind: 'item', id: item.id, label: item.name });
      continue;
    }
    const label = brandInTitle(deal.title, brands);
    if (!label) continue;
    const key = brandKey(label) ?? '';
    result.set(deal.node_id, { kind: 'brand', key, label, followed: followed.has(key) });
  }
  return result;
}

/** Deals first seen after the last Deals visit (a day back when never visited). */
export function newSince(seenAt: string | null, now: number): number {
  const at = seenAt ? Date.parse(seenAt) : NaN;
  return Number.isNaN(at) ? now - 86_400_000 : at;
}
