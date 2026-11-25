'use client';

import { CircleCheck, Clock, ExternalLink, Tag, ThumbsUp } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import InfoTip from '@/components/InfoTip';
import RetailerLogo from '@/components/RetailerLogo';
import { DEAL_SHOPS, dealShop, type DealSaving, type DealTab } from '@/lib/deals';

export type DealView = {
  id: number;
  title: string;
  url: string;
  shop: string;
  tab: DealTab;
  votes: number;
  price: string | null;
  saving: DealSaving | null;
  image: string | null;
  postedAt: string;
  posted: string;
  timeLeft: string | null;
  endsSoon: boolean;
  isNew: boolean;
  match: string | null;
  /** The same item at another shop on your list, when sizes agree. */
  elsewhere: { shop: string; price: string } | null;
};

type Sort = 'new' | 'votes';

const TABS: { key: DealTab; label: string }[] = [
  { key: 'shops', label: 'Shops we check' },
  { key: 'online', label: 'Online shopping' }
];

const HOT_VOTES = 50;

/** Fixed-size thumbnail; a plain tag icon when there is no image or it fails. */
function DealThumb({ src, href }: { src: string | null; href: string }) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  // An image that failed before hydration never reaches onError; check once on mount.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  return (
    <a className="deal-thumb" href={href} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true">
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- OzBargain-hosted thumbnail, fixed size, lazy
        <img
          ref={imgRef}
          src={src}
          alt=""
          width={96}
          height={96}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <Tag size={22} aria-hidden="true" />
      )}
    </a>
  );
}

const shopSite = (domain: string) => `https://www.${domain}/`;

function syncUrl(tab: DealTab, shop: string | null) {
  const params = new URLSearchParams();
  if (tab !== 'shops') params.set('tab', tab);
  if (shop) params.set('shop', shop);
  const query = params.toString();
  window.history.replaceState(null, '', query ? `/deals?${query}` : '/deals');
}

export default function DealsBoard({
  deals,
  staleShops,
  updatedLabel,
  loadFailed,
  signedIn,
  initialTab,
  initialShop
}: {
  deals: DealView[];
  staleShops: string[];
  updatedLabel: string | null;
  loadFailed: boolean;
  signedIn: boolean;
  initialTab: DealTab;
  initialShop: string | null;
}) {
  const [tab, setTab] = useState<DealTab>(initialTab);
  const [shop, setShop] = useState<string | null>(initialShop);
  const [sort, setSort] = useState<Sort>('new');
  const [onlyMatches, setOnlyMatches] = useState(false);

  const tabCounts = useMemo(() => {
    const counts: Record<DealTab, number> = { shops: 0, online: 0 };
    for (const deal of deals) counts[deal.tab] += 1;
    return counts;
  }, [deals]);

  const shopCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const deal of deals) counts.set(deal.shop, (counts.get(deal.shop) ?? 0) + 1);
    return counts;
  }, [deals]);

  const matchCount = useMemo(() => deals.filter((deal) => deal.tab === tab && deal.match).length, [deals, tab]);

  const visible = useMemo(() => {
    const list = deals.filter(
      (deal) => deal.tab === tab && (!shop || deal.shop === shop) && (!onlyMatches || deal.match)
    );
    // The server sends newest first.
    return sort === 'votes' ? list.toSorted((a, b) => b.votes - a.votes) : list;
  }, [deals, tab, shop, sort, onlyMatches]);

  const shops = DEAL_SHOPS.filter((item) => item.tab === tab);
  const selectedShop = shop ? dealShop(shop) : null;
  const staleHere = staleShops.filter((key) => shops.some((item) => item.key === key));

  const chooseTab = (next: DealTab) => {
    setTab(next);
    setShop(null);
    setOnlyMatches(false);
    syncUrl(next, null);
  };

  const chooseShop = (next: string | null) => {
    setShop(next);
    syncUrl(tab, next);
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = tab === 'shops' ? 'online' : 'shops';
    chooseTab(next);
    document.getElementById(`deals-tab-${next}`)?.focus();
  };

  return (
    <main className="deals-page">
      <header className="deals-head">
        <h1>
          Deals
          <InfoTip label="About these deals">
            Deals people post on OzBargain for these shops, checked a few times a day. Each one opens on OzBargain.
          </InfoTip>
        </h1>
        <p className="deals-source">
          via{' '}
          <a href="https://www.ozbargain.com.au" target="_blank" rel="noopener noreferrer">
            OzBargain
          </a>
          {updatedLabel ? <> · Updated {updatedLabel}</> : null}
        </p>
      </header>

      <div className="deals-tabs" role="tablist" aria-label="Deal type">
        {TABS.map((item) => (
          <button
            key={item.key}
            id={`deals-tab-${item.key}`}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            aria-controls="deals-panel"
            tabIndex={tab === item.key ? 0 : -1}
            className={tab === item.key ? 'is-active' : undefined}
            onClick={() => chooseTab(item.key)}
            onKeyDown={onTabKey}
          >
            {item.label}
            <span className="deals-count">{tabCounts[item.key]}</span>
          </button>
        ))}
      </div>

      <section id="deals-panel" role="tabpanel" aria-labelledby={`deals-tab-${tab}`} className="deals-panel">
        <div className="deals-toolbar">
          <div className="deals-chips" role="group" aria-label="Shop">
            <button type="button" aria-pressed={shop === null} onClick={() => chooseShop(null)}>
              All
            </button>
            {shops.map((item) => {
              const count = shopCounts.get(item.key) ?? 0;
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={shop === item.key}
                  disabled={count === 0 && shop !== item.key}
                  onClick={() => chooseShop(shop === item.key ? null : item.key)}
                >
                  <RetailerLogo retailer={item.name} url={`https://${item.domain}`} />
                  {item.name}
                  <span className="deals-count">{count}</span>
                </button>
              );
            })}
            {selectedShop ? (
              <a className="deals-shop-site" href={shopSite(selectedShop.domain)} target="_blank" rel="noopener noreferrer">
                {selectedShop.domain}
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            ) : null}
          </div>
          <div className="deals-sort">
            <div className="deals-segment" role="group" aria-label="Sort">
              <button type="button" aria-pressed={sort === 'new'} onClick={() => setSort('new')}>
                Newest
              </button>
              <button type="button" aria-pressed={sort === 'votes'} onClick={() => setSort('votes')}>
                Most votes
              </button>
            </div>
            {signedIn && matchCount > 0 ? (
              <button
                type="button"
                className="deals-match-toggle"
                aria-pressed={onlyMatches}
                onClick={() => setOnlyMatches((value) => !value)}
              >
                <CircleCheck size={15} aria-hidden="true" />
                On my list ({matchCount})
              </button>
            ) : null}
          </div>
        </div>

        {staleHere.length > 0 ? (
          <p className="deals-note">
            Could not refresh {staleHere.map((key) => dealShop(key)?.name ?? key).join(', ')} lately. Showing the last
            deals we got.
          </p>
        ) : null}

        {loadFailed ? (
          <p className="deals-empty">Deals could not load right now. Please try again soon.</p>
        ) : visible.length === 0 ? (
          <p className="deals-empty">
            {shop ? `No current deals at ${dealShop(shop)?.name ?? shop}.` : 'No current deals here yet.'}
          </p>
        ) : (
          <ul className="deals-grid">
            {visible.map((deal) => {
              const info = dealShop(deal.shop);
              return (
                <li key={deal.id} className={`deal-card${deal.match ? ' is-match' : ''}`}>
                  <div className="deal-body">
                  <div className="deal-top">
                    {info ? (
                      <a
                        className="deal-shop"
                        href={shopSite(info.domain)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${info.name} website`}
                      >
                        <RetailerLogo retailer={info.name} url={`https://${info.domain}`} />
                        {info.name}
                      </a>
                    ) : (
                      <span className="deal-shop">
                        <RetailerLogo retailer={deal.shop} url={null} />
                        {deal.shop}
                      </span>
                    )}
                    <time dateTime={deal.postedAt}>{deal.posted}</time>
                    {deal.isNew ? <span className="deal-badge is-new">New</span> : null}
                  </div>
                  <a className="deal-title" href={deal.url} target="_blank" rel="noopener noreferrer">
                    {deal.title}
                    <ExternalLink size={13} aria-hidden="true" />
                    <span className="sr-only"> (opens OzBargain)</span>
                  </a>
                  <div className="deal-meta">
                    {deal.price ? <span className="deal-price">{deal.price}</span> : null}
                    {deal.saving?.was ? (
                      <s className="deal-was">
                        <span className="sr-only">was </span>
                        {deal.saving.was}
                      </s>
                    ) : null}
                    {deal.saving?.percent ? <span className="deal-save">Save {deal.saving.percent}%</span> : null}
                    <span className={`deal-votes${deal.votes >= HOT_VOTES ? ' is-hot' : ''}`}>
                      <ThumbsUp size={13} aria-hidden="true" />
                      {deal.votes}
                      <span className="sr-only"> votes</span>
                    </span>
                    {deal.timeLeft ? (
                      <span className={`deal-ends${deal.endsSoon ? ' is-soon' : ''}`}>
                        <Clock size={13} aria-hidden="true" />
                        {deal.timeLeft}
                      </span>
                    ) : null}
                  </div>
                  {deal.match ? (
                    <p className="deal-match">
                      <CircleCheck size={14} aria-hidden="true" />
                      <span>
                        On your list: <b>{deal.match}</b>
                        {deal.elsewhere ? (
                          <>
                            {' '}
                            · {deal.elsewhere.shop} {deal.elsewhere.price}
                          </>
                        ) : null}
                      </span>
                    </p>
                  ) : null}
                  </div>
                  <DealThumb src={deal.image} href={deal.url} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="site-footer deals-footer">
        <p>
          Deal titles and votes from{' '}
          <a href="https://www.ozbargain.com.au" target="_blank" rel="noopener noreferrer">
            OzBargain
          </a>
          . Prices are as posted; check the deal before you buy.
        </p>
      </footer>
    </main>
  );
}
