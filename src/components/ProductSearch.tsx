'use client';

import { LoaderCircle, Search } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import RetailerLogo from '@/components/RetailerLogo';
import { cleanHttpUrl } from '@/lib/productUrl';

type SearchHit = {
  name: string;
  imageUrl: string | null;
  retailer: string;
  url: string;
};

function urlKey(url: string): string {
  return cleanHttpUrl(url) || url.trim();
}

export default function ProductSearch({
  trackedUrls,
  readOnly = false
}: {
  trackedUrls: string[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const tracked = useMemo(() => new Set(trackedUrls.map(urlKey)), [trackedUrls]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = query.trim();
    if (!nextQuery) return;
    setSearching(true);
    setMessage(null);
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: nextQuery })
    });
    const result = (await response.json().catch(() => null)) as
      | { configured?: boolean; results?: SearchHit[]; error?: string }
      | null;
    setSearching(false);
    if (!response.ok) {
      setHits([]);
      setMessage(result?.error || 'Product search is unavailable right now.');
      return;
    }
    if (result?.configured === false) {
      setConfigured(false);
      setHits([]);
      setMessage('Product search is not configured yet. Paste a shop link instead.');
      return;
    }
    const results = result?.results || [];
    setHits(results);
    setMessage(results.length === 0 ? 'No supported shop pages found for that search.' : null);
  }

  async function track(hit: SearchHit) {
    const key = urlKey(hit.url);
    if (tracked.has(key) || added.has(key)) return;
    setPendingUrl(key);
    setMessage(null);
    const response = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: hit.name,
        links: [{ url: hit.url, retailer: hit.retailer }]
      })
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    setPendingUrl(null);
    if (!response.ok) {
      setMessage(result?.error || 'Could not add that product.');
      return;
    }
    setAdded((current) => new Set(current).add(key));
    setMessage(`Tracking ${hit.name}. The price arrives on the next crawl.`);
    router.refresh();
  }

  return (
    <section className="product-search card">
      <div>
        <span className="eyebrow"><Search size={14} /> Search</span>
        <h2>Find a product</h2>
      </div>
      <form onSubmit={search}>
        <input
          className="product-search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Lemon biscuits"
          maxLength={120}
          aria-label="Search products"
        />
        <button className="button" type="submit" disabled={searching || !query.trim()}>
          {searching ? <LoaderCircle className="spin" size={16} /> : 'Search'}
        </button>
      </form>
      {message ? <p className="hint">{message}</p> : null}
      {configured && hits.length > 0 ? (
        <div className="product-search-results">
          {hits.map((hit) => {
            const key = urlKey(hit.url);
            const saved = tracked.has(key) || added.has(key);
            return (
              <article key={key} className="product-search-hit">
                {hit.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={hit.imageUrl} alt="" width={56} height={56} />
                ) : (
                  <span className="product-search-photo" aria-hidden="true" />
                )}
                <div>
                  <strong>{hit.name}</strong>
                  <span>
                    <RetailerLogo retailer={hit.retailer} url={hit.url} />
                    {hit.retailer}
                  </span>
                </div>
                {readOnly ? (
                  <a className="button secondary" href={hit.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                ) : (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={saved || pendingUrl === key}
                    onClick={() => track(hit)}
                  >
                    {saved ? 'Tracked' : pendingUrl === key ? 'Adding…' : 'Track'}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
