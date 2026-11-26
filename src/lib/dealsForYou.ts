import type { SupabaseClient } from '@supabase/supabase-js';

import { isNewFor, matchDeals, newSince, type BrandPref, type BrandState } from '@/lib/dealMatch';
import { isDealLive, priceFromTitle, type DealRow } from '@/lib/deals';
import { fetchProducts } from '@/lib/queries';

export const DEALS_SEEN_KEY = 'deals_seen';
export const DEAL_ROW_COLUMNS =
  'node_id, title, deal_url, shop, tab, votes_pos, votes_neg, posted_at, starts_at, expires_at, first_seen_at, image_url';

export async function loadBrandPrefs(supabase: SupabaseClient, userId: string): Promise<BrandPref[]> {
  const { data, error } = await supabase
    .from('deal_brand_prefs')
    .select('brand_key, label, state')
    .eq('user_id', userId);
  if (error) {
    console.error('[deals] brand prefs not loaded:', error.message);
    return [];
  }
  return (data ?? []).map((row) => ({ key: row.brand_key, label: row.label, state: row.state as BrandState }));
}

/** When this person last opened Deals; null if never. */
export async function loadDealsSeenAt(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_preferences')
    .select('value')
    .eq('user_id', userId)
    .eq('key', DEALS_SEEN_KEY)
    .maybeSingle();
  const at = (data?.value as { at?: unknown } | null)?.at;
  return typeof at === 'string' ? at : null;
}

export async function markDealsSeen(supabase: SupabaseClient, userId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('user_preferences')
    .upsert({ user_id: userId, key: DEALS_SEEN_KEY, value: { at: now }, updated_at: now });
  if (error) console.warn('[deals] visit not saved:', error.message);
}

export type ForYouItem = {
  id: number;
  title: string;
  url: string;
  shop: string;
  image: string | null;
  price: string | null;
  label: string;
  kind: 'item' | 'brand';
};

/** Deals for this person that arrived since their last Deals visit, newest first. */
export async function loadForYou(
  supabase: SupabaseClient,
  userId: string,
  now = Date.now()
): Promise<{ count: number; items: ForYouItem[] }> {
  const seenAt = await loadDealsSeenAt(supabase, userId);
  const sinceMs = newSince(seenAt, now);
  const since = new Date(sinceMs).toISOString();
  const [dealsResult, products, prefs] = await Promise.all([
    supabase
      .from('ozb_deals')
      .select(DEAL_ROW_COLUMNS)
      .eq('is_expired', false)
      .gt('first_seen_at', since)
      .order('first_seen_at', { ascending: false })
      .limit(200),
    fetchProducts(supabase, userId).catch(() => []),
    loadBrandPrefs(supabase, userId)
  ]);
  const rows = ((dealsResult.data ?? []) as DealRow[]).filter(
    (deal) => isDealLive(deal, now) && isNewFor(deal, sinceMs)
  );
  const matches = matchDeals(rows, products, prefs);
  const items = rows.flatMap((deal): ForYouItem[] => {
    const match = matches.get(deal.node_id);
    if (!match) return [];
    return [
      {
        id: deal.node_id,
        title: deal.title,
        url: deal.deal_url,
        shop: deal.shop,
        image: deal.image_url,
        price: priceFromTitle(deal.title),
        label: match.label,
        kind: match.kind
      }
    ];
  });
  // Exact items first, then newest.
  items.sort((a, b) => Number(b.kind === 'item') - Number(a.kind === 'item'));
  return { count: items.length, items: items.slice(0, 3) };
}
