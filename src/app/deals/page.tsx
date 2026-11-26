import type { Metadata } from 'next';
import { after } from 'next/server';

import DealsBoard, { type DealView } from '@/components/DealsBoard';
import { getViewer } from '@/lib/auth';
import {
  DEAL_SHOPS,
  isDealLive,
  isNewDeal,
  updatedAgoLabel,
  postedAgoLabel,
  priceFromTitle,
  sameSize,
  savingFromTitle,
  timeLeftLabel,
  type DealRow,
  type DealTab,
  type FeedStatusRow
} from '@/lib/deals';
import { matchDeals, newSince } from '@/lib/dealMatch';
import { loadBrandPrefs, loadDealsSeenAt, markDealsSeen } from '@/lib/dealsForYou';
import { noteDealsVisit } from '@/lib/dealsRefresh';
import { formatMoney } from '@/lib/format';
import { fetchProducts } from '@/lib/queries';
import { retailerKey } from '@/lib/retailer';
import { sparkFor, type DailyPriceRow } from '@/lib/sparkline';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ProductView } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export const metadata: Metadata = {
  title: 'Deals · PriceTracker',
  description: 'Current deals at Coles, Woolworths, Kmart, Big W, Amazon AU, eBay and more, via OzBargain.'
};

const DEAL_COLUMNS =
  'node_id, title, deal_url, shop, tab, votes_pos, votes_neg, posted_at, starts_at, expires_at, first_seen_at, image_url';
const STALE_FEED_MS = 12 * 3_600_000;

type DealsSearchParams = { tab?: string | string[]; shop?: string | string[]; mine?: string | string[] };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Cheapest fresh, in-stock price for the product at a shop other than the deal's. */
function elsewhereOnList(product: ProductView | undefined, dealShop: string) {
  let best: { shop: string; price: number } | null = null;
  for (const link of product?.links ?? []) {
    if (!link.isActive || link.priceStale || link.stockStatus === 'unavailable' || link.latestPrice === null) continue;
    const key = retailerKey(link.retailer) ?? retailerKey(link.url);
    if (!key || key === dealShop) continue;
    if (!best || link.latestPrice < best.price) best = { shop: link.retailer, price: link.latestPrice };
  }
  return best ? { shop: best.shop, price: formatMoney(best.price) } : null;
}

export default async function DealsPage({ searchParams }: { searchParams: Promise<DealsSearchParams> }) {
  // After the page is sent: note the visit, and fetch fresh deals if due.
  after(() => noteDealsVisit());
  const params = await searchParams;
  const [viewer, supabase] = await Promise.all([getViewer(), createServerSupabaseClient()]);
  const now = Date.now();

  const [dealsResult, statusResult, productsResult, prefs, seenAt] = await Promise.all([
    supabase
      .from('ozb_deals')
      .select(DEAL_COLUMNS)
      .eq('is_expired', false)
      .order('posted_at', { ascending: false })
      .limit(400),
    supabase.from('ozb_feed_status').select('shop, last_ok_at, last_attempt_at'),
    viewer ? fetchProducts(supabase, viewer.id).catch(() => [] as ProductView[]) : ([] as ProductView[]),
    viewer ? loadBrandPrefs(supabase, viewer.id) : [],
    viewer ? loadDealsSeenAt(supabase, viewer.id) : null
  ]);

  if (dealsResult.error) console.error('[deals] load failed:', dealsResult.error.message);
  const rows = ((dealsResult.data ?? []) as DealRow[]).filter((deal) => isDealLive(deal, now));
  const statuses = (statusResult.data ?? []) as FeedStatusRow[];
  const products = productsResult;
  // Exact items, then brands or shows you track or follow (Hot Wheels, Bluey); muted brands left out.
  const matches = matchDeals(rows, products, prefs);
  const since = newSince(seenAt, now);

  // Price over the last 90 days for deals that are exactly an item you track.
  const itemIds = [...new Set([...matches.values()].flatMap((match) => (match.kind === 'item' ? [match.id] : [])))];
  const dailyRows: DailyPriceRow[] = itemIds.length
    ? (((
        await supabase
          .from('price_link_daily')
          .select('link_id, product_id, day, min_price')
          .in('product_id', itemIds)
          .gte('day', new Date(now - 90 * 86_400_000).toISOString().slice(0, 10))
      ).data ?? []) as DailyPriceRow[])
    : [];
  if (viewer && !viewer.isDemo) await markDealsSeen(supabase, viewer.id);

  const deals: DealView[] = rows.map((deal): DealView => {
    const price = priceFromTitle(deal.title);
    const match = matches.get(deal.node_id) ?? null;
    const item = match?.kind === 'item' ? products.find((product) => product.id === match.id) : undefined;
    // Another shop's price only when the deal is clearly the same item and size.
    const elsewhere = item && sameSize(item.name, deal.title) ? elsewhereOnList(item, deal.shop) : null;
    const shopLinkIds = (item?.links ?? [])
      .filter((link) => (retailerKey(link.retailer) ?? retailerKey(link.url)) === deal.shop)
      .map((link) => link.id);
    return {
      id: deal.node_id,
      title: deal.title,
      url: deal.deal_url,
      shop: deal.shop,
      tab: deal.tab,
      votes: deal.votes_pos - deal.votes_neg,
      price,
      saving: savingFromTitle(deal.title, price),
      image: deal.image_url,
      postedAt: deal.posted_at,
      posted: postedAgoLabel(deal.posted_at, now),
      timeLeft: timeLeftLabel(deal.expires_at, now),
      endsSoon: deal.expires_at ? Date.parse(deal.expires_at) - now < 2 * 86_400_000 : false,
      isNew: isNewDeal(deal, now),
      match:
        match?.kind === 'brand'
          ? { kind: 'brand', label: match.label, followed: match.followed }
          : match
            ? { kind: 'item', label: match.label, followed: false }
            : null,
      forYou: Boolean(match) && Date.parse(deal.first_seen_at) > since,
      spark: item ? sparkFor(dailyRows, item.id, shopLinkIds) : null,
      elsewhere
    };
  });

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
      updated={
        lastOk
          ? {
              at: lastOk,
              label: updatedAgoLabel(lastOk, now),
              exact: new Date(lastOk).toLocaleString('en-AU', {
                timeZone: 'Australia/Perth',
                dateStyle: 'medium',
                timeStyle: 'short'
              })
            }
          : null
      }
      loadFailed={Boolean(dealsResult.error)}
      signedIn={Boolean(viewer)}
      canSavePrefs={Boolean(viewer && !viewer.isDemo)}
      muted={prefs.filter((pref) => pref.state === 'mute').map((pref) => pref.label)}
      initialMine={first(params.mine) === '1'}
      initialTab={initialTab}
      initialShop={initialShop}
    />
  );
}
