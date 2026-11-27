import type { SupabaseClient } from '@supabase/supabase-js';

import { isDealLive, isNewDeal, postedAgoLabel, priceFromTitle, timeLeftLabel, updatedAgoLabel } from '@/lib/deals';

import { EAT_CHAINS, eatChain } from './chains';
import { dedupeKey, isFoodDeal, needsApp, regionOf, type EatRegion } from './classify';

/** One row of public.eat_deals, as the page reads it. */
export type EatDealRow = {
  node_id: number;
  title: string;
  deal_url: string;
  chain: string;
  votes_pos: number;
  votes_neg: number;
  posted_at: string;
  expires_at: string | null;
  image_url: string | null;
  category: string | null;
};

export type EatDealView = {
  id: number;
  title: string;
  url: string;
  chain: string;
  chainName: string;
  region: Exclude<EatRegion, 'other'>;
  app: boolean;
  price: string | null;
  votes: number;
  image: string | null;
  posted: string;
  timeLeft: string | null;
  isNew: boolean;
};

export type EatGroups = {
  everyone: EatDealView[];
  wa: EatDealView[];
  app: EatDealView[];
  /** Chains whose deals live in their app: an "open the app" chip each. */
  appChains: { key: string; name: string; url: string }[];
};

export const EAT_DEAL_COLUMNS =
  'node_id, title, deal_url, chain, votes_pos, votes_neg, posted_at, expires_at, image_url, category';

/**
 * Live food deals valid in WA, one card per deal (same chain and same words
 * kept once, the best voted), sorted by votes within each group.
 */
export function buildEatGroups(rows: EatDealRow[], now: number): EatGroups {
  const byKey = new Map<string, EatDealView>();
  for (const row of rows) {
    const chain = eatChain(row.chain);
    if (!chain || !isDealLive(row, now) || !isFoodDeal(row.title, row.category)) continue;
    const region = regionOf(row.title);
    if (region === 'other') continue;
    const view: EatDealView = {
      id: row.node_id,
      title: row.title,
      url: row.deal_url,
      chain: chain.key,
      chainName: chain.name,
      region,
      app: needsApp(row.title),
      price: priceFromTitle(row.title),
      votes: row.votes_pos - row.votes_neg,
      image: row.image_url,
      posted: postedAgoLabel(row.posted_at, now),
      timeLeft: timeLeftLabel(row.expires_at, now),
      isNew: isNewDeal(row, now)
    };
    const key = dedupeKey(chain.key, row.title);
    const kept = byKey.get(key);
    if (!kept || view.votes > kept.votes) byKey.set(key, view);
  }
  const all = [...byKey.values()].sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.votes - a.votes);
  return {
    everyone: all.filter((d) => !d.app && d.region === 'national'),
    wa: all.filter((d) => !d.app && d.region === 'wa'),
    app: all.filter((d) => d.app),
    appChains: EAT_CHAINS.filter((c) => c.appDeals).map((c) => ({ key: c.key, name: c.name, url: c.url }))
  };
}

export type EatData = { groups: EatGroups; updated: { label: string; exact: string } | null; failed: boolean };

export async function loadEatDeals(supabase: SupabaseClient, now = Date.now()): Promise<EatData> {
  const [deals, status] = await Promise.all([
    supabase
      .from('eat_deals')
      .select(EAT_DEAL_COLUMNS)
      .eq('is_expired', false)
      .order('posted_at', { ascending: false })
      .limit(300),
    supabase.from('eat_feed_status').select('feed, last_ok_at')
  ]);
  if (deals.error) console.error('[eat] load failed:', deals.error.message);
  const lastOk = ((status.data ?? []) as { last_ok_at: string | null }[]).reduce<string | null>(
    (latest, row) => (row.last_ok_at && (!latest || row.last_ok_at > latest) ? row.last_ok_at : latest),
    null
  );
  return {
    groups: buildEatGroups((deals.data ?? []) as EatDealRow[], now),
    updated: lastOk
      ? {
          label: updatedAgoLabel(lastOk, now),
          exact: new Date(lastOk).toLocaleString('en-AU', {
            timeZone: 'Australia/Perth',
            dateStyle: 'medium',
            timeStyle: 'short'
          })
        }
      : null,
    failed: Boolean(deals.error)
  };
}
