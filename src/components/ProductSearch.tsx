'use client';

import { Check, ExternalLink, LoaderCircle, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import RetailerLogo from '@/components/RetailerLogo';
import { cleanHttpUrl } from '@/lib/productUrl';
import type { ShopHit, ShopOffer } from '@/lib/productSearch';

type Limited = 'demo' | 'off' | 'user_day' | 'user_month' | 'site_day' | 'error';

type SearchResponse = {
  query?: string;
  tracked?: { id: string; name: string }[];
  shops?: ShopHit[];
  limited?: Limited;
  error?: string;
};

const LIMIT_TEXT: Record<Limited, string> = {
  demo: 'Make your own free list to search every shop.',
  off: 'Shop search is resting today.',
  user_day: "You've used today's searches. Try again tomorrow.",
  user_month: "You've used this month's searches.",
  site_day: 'Shop search is resting until tomorrow.',
  error: 'Shops did not answer. Please try again soon.'
};

const money = (value: number | null) => (value === null ? '' : `$${value.toFixed(2)}`);

function urlKey(url: string): string {
  return cleanHttpUrl(url) || url.trim();
}

export default function ProductSearch({
  trackedUrls,
  isDemo = false
}: {
  trackedUrls: string[];
  isDemo?: boolean;
}) {
  const tracked = useMemo(() => new Set(trackedUrls.map(urlKey)), [trackedUrls]);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [doneIds, setDoneIds] = useState<Set<string>>(() => new Set());

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = query.trim();
    if (!nextQuery || searching) return;
    setSearching(true);
    setOpenId(null);
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: nextQuery })
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as SearchResponse | null;
    setSearching(false);
    setResult(response?.ok && data ? { ...data, query: nextQuery } : { query: nextQuery, limited: 'error' });
  }

  const shops = result?.shops || [];
  const ownMatches = result?.tracked || [];
  const showFallback = Boolean(result && (result.limited || (shops.length === 0 && ownMatches.length === 0)));

  return (
    <section className="product-search card" aria-label="Search shops">
      <form onSubmit={search} role="search">
        <Search className="product-search-icon" size={18} aria-hidden="true" />
        <input
          className="product-search-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="What are you looking for?"
          maxLength={120}
          aria-label="Search shops"
        />
        <button className="button primary" type="submit" disabled={searching || !query.trim()}>
          {searching ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : null}
          Search
        </button>
      </form>

      {ownMatches.length > 0 ? (
        <ul className="product-search-own" aria-label="Already on your list">
          {ownMatches.map((item) => (
            <li key={item.id}>
              <Check size={14} aria-hidden="true" /> {item.name}
            </li>
          ))}
        </ul>
      ) : null}

      {result?.limited ? <p className="hint">{LIMIT_TEXT[result.limited]}</p> : null}

      {searching && shops.length === 0 ? (
        <div className="product-search-results" aria-hidden="true">
          {[0, 1, 2].map((n) => (
            <div key={n} className="product-search-skel" />
          ))}
        </div>
      ) : null}

      {shops.length > 0 ? (
        <div className="product-search-results">
          {shops.map((hit) => (
            <SearchHitCard
              key={hit.id}
              hit={hit}
              open={openId === hit.id}
              done={doneIds.has(hit.id)}
              isDemo={isDemo}
              tracked={tracked}
              onToggle={() => setOpenId((current) => (current === hit.id ? null : hit.id))}
              onDone={() => {
                setDoneIds((current) => new Set(current).add(hit.id));
                setOpenId(null);
              }}
            />
          ))}
        </div>
      ) : null}

      {showFallback && result?.query ? (
        <a
          className="button secondary search-fallback"
          href={`https://www.google.com.au/search?tbm=shop&q=${encodeURIComponent(result.query)}`}
          target="_blank"
          rel="noreferrer"
        >
          Search Google Shopping <ExternalLink size={14} aria-hidden="true" />
        </a>
      ) : null}
    </section>
  );
}

function SearchHitCard({
  hit,
  open,
  done,
  isDemo,
  tracked,
  onToggle,
  onDone
}: {
  hit: ShopHit;
  open: boolean;
  done: boolean;
  isDemo: boolean;
  tracked: Set<string>;
  onToggle: () => void;
  onDone: () => void;
}) {
  return (
    <article className={`product-search-hit${open ? ' is-open' : ''}`}>
      <div className="product-search-row">
        {hit.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hit.imageUrl} alt="" width={64} height={64} loading="lazy" />
        ) : (
          <span className="product-search-photo" aria-hidden="true" />
        )}
        <div className="product-search-text">
          <strong>{hit.name}</strong>
          <span>
            <RetailerLogo retailer={hit.shop} />
            {hit.shop}
          </span>
        </div>
        <b className="product-search-price">{money(hit.price)}</b>
        {done ? (
          <span className="product-search-done">
            <Check size={15} aria-hidden="true" /> Tracking
          </span>
        ) : (
          <button
            className={`button ${hit.supported ? 'primary' : 'secondary'}`}
            type="button"
            aria-expanded={open}
            onClick={onToggle}
          >
            {open ? <X size={15} aria-label="Close" /> : hit.supported ? 'Track' : 'Shops'}
          </button>
        )}
      </div>
      {open ? (
        <TrackPanel hit={hit} isDemo={isDemo} tracked={tracked} onDone={onDone} />
      ) : null}
    </article>
  );
}

function TrackPanel({
  hit,
  isDemo,
  tracked,
  onDone
}: {
  hit: ShopHit;
  isDemo: boolean;
  tracked: Set<string>;
  onDone: () => void;
}) {
  const router = useRouter();
  const [offers, setOffers] = useState<ShopOffer[] | null>(null);
  const [limited, setLimited] = useState<Limited | null>(null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [goal, setGoal] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const response = await fetch('/api/search/shops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: hit.id, token: hit.token })
      }).catch(() => null);
      const data = (await response?.json().catch(() => null)) as
        | { offers?: ShopOffer[]; limited?: Limited }
        | null;
      if (!live) return;
      const list = data?.offers || [];
      setOffers(list);
      setLimited(response?.ok ? data?.limited || null : 'error');
      setPicked(new Set(list.filter((offer) => offer.trackable && !tracked.has(urlKey(offer.url))).map((offer) => offer.url)));
    })();
    return () => {
      live = false;
    };
    // Load once per opened card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hit.id]);

  async function save() {
    if (!offers || picked.size === 0) return;
    setSaving(true);
    setError(null);
    const response = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: hit.name,
        targetPrice: goal || null,
        links: offers
          .filter((offer) => picked.has(offer.url))
          .map((offer) => ({ url: offer.url, retailer: offer.shop }))
      })
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { error?: string } | null;
    setSaving(false);
    if (!response?.ok) {
      setError(data?.error || 'Could not add it. Please try again.');
      return;
    }
    onDone();
    router.refresh();
  }

  if (!offers) {
    return (
      <div className="track-panel">
        <LoaderCircle className="spin" size={18} aria-label="Loading shops" />
      </div>
    );
  }

  const trackable = offers.filter((offer) => offer.trackable);

  return (
    <div className="track-panel">
      {limited ? <p className="hint">{LIMIT_TEXT[limited]}</p> : null}
      {offers.length > 0 ? (
        <ul className="track-offers">
          {offers.map((offer) => {
            const already = tracked.has(urlKey(offer.url));
            return (
              <li key={offer.url}>
                {offer.trackable && !already ? (
                  <label>
                    <input
                      type="checkbox"
                      checked={picked.has(offer.url)}
                      onChange={(event) =>
                        setPicked((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(offer.url);
                          else next.delete(offer.url);
                          return next;
                        })
                      }
                    />
                    <RetailerLogo retailer={offer.shop} url={offer.url} />
                    <span>{offer.shop}</span>
                  </label>
                ) : (
                  <span className="track-offer-name">
                    {already ? <Check size={15} aria-label="Already tracking" /> : null}
                    <RetailerLogo retailer={offer.shop} url={offer.url} />
                    <span>{offer.shop}</span>
                  </span>
                )}
                <b>{money(offer.price)}</b>
                {offer.trackable ? null : (
                  <a href={offer.url} target="_blank" rel="noreferrer" className="track-open">
                    Open shop <ExternalLink size={13} aria-hidden="true" />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {isDemo ? (
        <Link className="button primary" href="/register">
          Make my own list
        </Link>
      ) : trackable.length > 0 ? (
        <div className="track-actions">
          <label className="track-goal">
            <span>Goal price</span>
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="Optional"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
            />
          </label>
          <button className="button primary" type="button" disabled={saving || picked.size === 0} onClick={save}>
            {saving ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : null}
            Start tracking
          </button>
        </div>
      ) : null}
      {error ? <p className="hint error">{error}</p> : null}
    </div>
  );
}
