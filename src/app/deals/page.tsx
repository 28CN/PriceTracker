import type { Metadata } from 'next';

import DealsBoard, { type DealView } from '@/components/DealsBoard';
import { getViewer } from '@/lib/auth';
import {
  DEAL_SHOPS,
  isDealLive,
  isNewDeal,
  matchDealsToProducts,
  postedAgoLabel,
  priceFromTitle,
  timeLeftLabel,
  type DealRow,
  type DealTab,
  type FeedStatusRow
} from '@/lib/deals';
import { formatWhen } from '@/lib/format';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export const metadata: Metadata = {
  title: 'Deals · PriceTracker',
  description: 'Current deals at Coles, Woolworths, Kmart, Big W, Amazon AU, eBay and more, via OzBargain.'
};

const DEAL_COLUMNS =
  'node_id, title, deal_url, shop, tab, votes_pos, votes_neg, posted_at, starts_at, expires_at, first_seen_at';
const STALE_FEED_MS = 12 * 3_600_000;

type DealsSearchParams = { tab?: string | string[]; shop?: string | string[] };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function DealsPage({ searchParams }: { searchParams: Promise<DealsSearchParams> }) {
  const params = await searchParams;
  const [viewer, supabase] = await Promise.all([getViewer(), createServerSupabaseClient()]);
  const now = Date.now();

  const [dealsResult, statusResult, productsResult] = await Promise.all([
    supabase
      .from('ozb_deals')
      .select(DEAL_COLUMNS)
      .eq('is_expired', false)
      .order('posted_at', { ascending: false })
      .limit(400),
    supabase.from('ozb_feed_status').select('shop, last_ok_at, last_attempt_at'),
    viewer ? supabase.from('products').select('name').eq('owner_id', viewer.id).limit(500) : null
  ]);

  if (dealsResult.error) console.error('[deals] load failed:', dealsResult.error.message);
  const rows = ((dealsResult.data ?? []) as DealRow[]).filter((deal) => isDealLive(deal, now));
  const statuses = (statusResult.data ?? []) as FeedStatusRow[];
  const productNames = ((productsResult?.data ?? []) as { name: string }[]).map((row) => row.name);
  const matches = productNames.length ? matchDealsToProducts(rows, productNames) : new Map<number, string>();

  const deals: DealView[] = rows.map((deal) => ({
    id: deal.node_id,
    title: deal.title,
    url: deal.deal_url,
    shop: deal.shop,
    tab: deal.tab,
    votes: deal.votes_pos - deal.votes_neg,
    price: priceFromTitle(deal.title),
    postedAt: deal.posted_at,
    posted: postedAgoLabel(deal.posted_at, now),
    timeLeft: timeLeftLabel(deal.expires_at, now),
    endsSoon: deal.expires_at ? Date.parse(deal.expires_at) - now < 2 * 86_400_000 : false,
    isNew: isNewDeal(deal, now),
    match: matches.get(deal.node_id) ?? null
  }));

  // Shops whose feed has not worked lately: say so instead of hiding it.
  const staleShops = DEAL_SHOPS.filter((shop) => {
    const status = statuses.find((row) => row.shop === shop.key);
    if (!status) return false;
    const ok = status.last_ok_at ? Date.parse(status.last_ok_at) : 0;
    return now - ok > STALE_FEED_MS;
  }).map((shop) => shop.key);

  const lastOk = statuses.reduce<string | null>(
    (latest, row) => (row.last_ok_at && (!latest || row.last_ok_at > latest) ? row.last_ok_at : latest),
    null
  );

  const tabParam = first(params.tab);
  const initialTab: DealTab = tabParam === 'online' ? 'online' : 'shops';
  const shopParam = first(params.shop) ?? null;
  const initialShop = DEAL_SHOPS.some((shop) => shop.key === shopParam && shop.tab === initialTab) ? shopParam : null;

  return (
    <DealsBoard
      deals={deals}
      staleShops={staleShops}
      updatedLabel={lastOk ? formatWhen(lastOk) : null}
      loadFailed={Boolean(dealsResult.error)}
      signedIn={Boolean(viewer)}
      initialTab={initialTab}
      initialShop={initialShop}
    />
  );
}
