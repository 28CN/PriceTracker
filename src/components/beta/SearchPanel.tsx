'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import RetailerLogo from '@/components/RetailerLogo';
import { formatMoney } from '@/lib/format';
import { LIST_LABELS, type ListKind } from '@/lib/listKind';
import { detectRetailer, isValidHttpUrl } from '@/lib/retailer';
import {
  SEARCH_RETAILERS,
  googleShoppingUrl,
  type SearchHit,
  type ShopSearchResult
} from '@/lib/shopSearch';
import type { CategoryView, ProductView } from '@/lib/types';

type SelectedKey = string;

function hitKey(hit: SearchHit): SelectedKey {
  return `${hit.retailerId}::${hit.url}`;
}

function sortHits(hits: SearchHit[]): SearchHit[] {
  return [...hits].sort((a, b) => {
    if (a.price === null && b.price === null) return a.name.localeCompare(b.name);
    if (a.price === null) return 1;
    if (b.price === null) return -1;
    if (a.price !== b.price) return a.price - b.price;
    return a.name.localeCompare(b.name);
  });
}

export default function SearchPanel({
  listKind,
  products,
  categories,
  initialQuery = ''
}: {
  listKind: ListKind;
  products: ProductView[];
  categories: CategoryView[];
  initialQuery?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [selectedShops, setSelectedShops] = useState<string[]>(() =>
    SEARCH_RETAILERS.filter((shop) => shop.defaultOn).map((shop) => shop.id)
  );
  const [results, setResults] = useState<ShopSearchResult[]>([]);
  const [selected, setSelected] = useState<Record<SelectedKey, SearchHit>>({});
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [mode, setMode] = useState<'existing' | 'new'>('new');
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [newName, setNewName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const autoStarted = useRef(false);

  const selectedHits = useMemo(() => Object.values(selected), [selected]);
  const mergedHits = useMemo(
    () => sortHits(results.flatMap((block) => block.results)),
    [results]
  );
  const missedShops = useMemo(
    () => results.filter((block) => block.results.length === 0 && block.error),
    [results]
  );
  const shopCount = selectedShops.length;
  const doneCount = results.length;

  function toggleShop(id: string) {
    setSelectedShops((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function toggleHit(hit: SearchHit) {
    const key = hitKey(hit);
    setSelected((current) => {
      const next = { ...current };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = hit;
      }
      return next;
    });
  }

  async function runSearchFor(rawQuery: string) {
    const q = rawQuery.trim();
    if (q.length < 2 || selectedShops.length === 0) {
      return;
    }

    setIsSearching(true);
    setFeedback(null);
    setResults([]);
    setSelected({});
    router.replace(`/beta/${listKind}/search?q=${encodeURIComponent(q)}`, { scroll: false });

    await Promise.all(
      selectedShops.map(async (retailer) => {
        const shop = SEARCH_RETAILERS.find((item) => item.id === retailer);
        try {
          const response = await fetch(
            `/api/search?retailer=${encodeURIComponent(retailer)}&q=${encodeURIComponent(q)}`
          );
          const data = (await response.json()) as ShopSearchResult & { error?: string };
          const block: ShopSearchResult = response.ok
            ? data
            : {
                retailer: shop?.name || retailer,
                retailerId: retailer,
                results: [],
                fallbackUrl: shop?.fallbackUrl(q) || '',
                error: data.error || 'Search failed.'
              };
          setResults((current) => [...current.filter((item) => item.retailerId !== retailer), block]);
        } catch (error) {
          setResults((current) => [
            ...current.filter((item) => item.retailerId !== retailer),
            {
              retailer: shop?.name || retailer,
              retailerId: retailer,
              results: [],
              fallbackUrl: shop?.fallbackUrl(q) || '',
              error: error instanceof Error ? error.message : 'Search failed.'
            }
          ]);
        }
      })
    );

    setIsSearching(false);
  }

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    await runSearchFor(query);
  }

  useEffect(() => {
    if (autoStarted.current) return;
    const q = initialQuery.trim();
    if (q.length < 2) return;
    autoStarted.current = true;
    void runSearchFor(q);
    // Default shops + URL query only; do not retrigger when chips change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  function openInShops() {
    const q = query.trim();
    if (q.length < 2) return;
    for (const id of selectedShops) {
      const shop = SEARCH_RETAILERS.find((item) => item.id === id);
      if (shop) {
        window.open(shop.fallbackUrl(q), '_blank', 'noopener,noreferrer');
      }
    }
  }

  function addPastedUrls() {
    const urls = pasteText
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter((item) => isValidHttpUrl(item));

    if (urls.length === 0) {
      setFeedback({ tone: 'error', text: 'Paste at least one http(s) product URL.' });
      return;
    }

    setSelected((current) => {
      const next = { ...current };
      for (const url of urls) {
        const retailer = detectRetailer(url) || 'Shop';
        const hit: SearchHit = {
          retailer,
          retailerId: 'pasted',
          name: retailer,
          price: null,
          url,
          imageUrl: null
        };
        next[hitKey(hit)] = hit;
      }
      return next;
    });
    setPasteText('');
    setFeedback({ tone: 'ok', text: `Added ${urls.length} link(s). Save them below.` });
  }

  async function saveSelected(event: React.FormEvent) {
    event.preventDefault();
    if (selectedHits.length === 0) {
      setFeedback({ tone: 'error', text: 'Select at least one search result.' });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    const links = selectedHits.map((hit) => ({
      url: hit.url,
      retailer: hit.retailer
    }));

    try {
      if (mode === 'existing') {
        if (!productId) {
          throw new Error('Pick a tracked product to add these links to.');
        }
        const response = await fetch('/api/links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, links })
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error || 'Could not add links.');
        }
        setFeedback({
          tone: 'ok',
          text: `Added ${links.length} link(s). Prices appear on the next crawl.`
        });
      } else {
        const name = newName.trim() || selectedHits[0].name;
        const response = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            listKind,
            imageUrl: selectedHits.find((hit) => hit.imageUrl)?.imageUrl || null,
            categoryId: categoryId || null,
            newCategoryName: categoryId ? null : newCategoryName,
            links
          })
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error || 'Could not create the product.');
        }
        setFeedback({ tone: 'ok', text: `Saved “${name}” to ${LIST_LABELS[listKind]}.` });
        setNewName('');
      }

      setSelected({});
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Could not save.'
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="search-page">
      <form className="search-hero" onSubmit={runSearch}>
        <h1 className="search-hero-title">Search shops</h1>
        <p className="hint">{LIST_LABELS[listKind]} · tick a card to add it to this list</p>
        <div className="search-hero-row">
          <input
            id="beta-search-q"
            className="search-hero-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Panadol, Makita drill, full cream milk"
            required
            minLength={2}
            autoFocus
          />
          <button
            type="submit"
            className="button primary"
            disabled={isSearching || selectedShops.length === 0}
          >
            {isSearching ? 'Searching…' : 'Search'}
          </button>
        </div>

        <div className="shop-chips" role="group" aria-label="Shops">
          {SEARCH_RETAILERS.map((shop) => {
            const on = selectedShops.includes(shop.id);
            return (
              <button
                key={shop.id}
                type="button"
                className={`shop-chip${on ? ' is-on' : ''}`}
                aria-pressed={on}
                onClick={() => toggleShop(shop.id)}
              >
                {shop.name}
              </button>
            );
          })}
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="button"
            disabled={query.trim().length < 2 || selectedShops.length === 0}
            onClick={openInShops}
          >
            Open shops in browser
          </button>
          {query.trim().length >= 2 ? (
            <a
              className="button"
              href={googleShoppingUrl(query.trim())}
              target="_blank"
              rel="noreferrer"
            >
              Google Shopping
            </a>
          ) : (
            <button type="button" className="button" disabled>
              Google Shopping
            </button>
          )}
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          Best when this site runs on your computer. Some shops still block non-browser
          requests — use Open shop search for those.
        </p>
      </form>

      <details className="search-paste">
        <summary>Paste product page URLs</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            addPastedUrls();
          }}
        >
          <p className="hint" style={{ marginTop: 8 }}>
            If a shop did not return cards, copy the product page link here and save it like a
            search result.
          </p>
          <div className="field">
            <label htmlFor="paste-urls">Product URLs</label>
            <textarea
              id="paste-urls"
              rows={3}
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              placeholder="https://www.bunnings.com.au/..."
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="button primary">
              Use these links
            </button>
          </div>
        </form>
      </details>

      {isSearching || results.length > 0 ? (
        <p className="search-status">
          {isSearching
            ? `Searching ${doneCount}/${shopCount} shops…`
            : `${mergedHits.length} result${mergedHits.length === 1 ? '' : 's'}`}
        </p>
      ) : null}

      {missedShops.length > 0 ? (
        <ul className="search-misses">
          {missedShops.map((block) => (
            <li key={block.retailerId}>
              <strong>{block.retailer}</strong> — {block.error}{' '}
              {block.fallbackUrl ? (
                <a href={block.fallbackUrl} target="_blank" rel="noreferrer">
                  Open shop search
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {mergedHits.length > 0 ? (
        <div className="search-grid">
          {mergedHits.map((hit) => {
            const key = hitKey(hit);
            const isOn = Boolean(selected[key]);
            return (
              <article key={key} className={`search-card${isOn ? ' is-selected' : ''}`}>
                <button
                  type="button"
                  className="search-card-select"
                  onClick={() => toggleHit(hit)}
                  aria-pressed={isOn}
                >
                  {hit.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={hit.imageUrl} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="search-card-ph">No image</div>
                  )}
                  <p className="search-card-price">
                    {hit.price === null ? 'Price on site' : formatMoney(hit.price)}
                  </p>
                  <p className="search-card-name">{hit.name}</p>
                  <p className="search-card-shop">
                    <RetailerLogo retailer={hit.retailer} />
                    {hit.retailer}
                  </p>
                </button>
                <label className="search-card-pick">
                  <input type="checkbox" checked={isOn} onChange={() => toggleHit(hit)} />
                  Select
                </label>
                <a href={hit.url} target="_blank" rel="noreferrer">
                  Open on {hit.retailer}
                </a>
              </article>
            );
          })}
        </div>
      ) : null}

      {feedback && selectedHits.length === 0 ? (
        <p className={`hint ${feedback.tone === 'error' ? 'error' : 'ok'}`} style={{ marginTop: 12 }}>
          {feedback.text}
        </p>
      ) : null}

      {selectedHits.length > 0 ? (
        <form className="search-save" onSubmit={saveSelected}>
          <p className="section-title" style={{ marginTop: 0 }}>
            {selectedHits.length} selected
          </p>
          <div className="shop-checks">
            <label className="shop-check">
              <input
                type="radio"
                name="save-mode"
                checked={mode === 'new'}
                onChange={() => setMode('new')}
              />
              Create a new tracked product
            </label>
            <label className="shop-check">
              <input
                type="radio"
                name="save-mode"
                checked={mode === 'existing'}
                onChange={() => setMode('existing')}
              />
              Add to an existing product on {LIST_LABELS[listKind]}
            </label>
          </div>

          {mode === 'new' ? (
            <>
              <div className="field">
                <label htmlFor="new-track-name">Product name</label>
                <input
                  id="new-track-name"
                  type="text"
                  value={newName}
                  placeholder={selectedHits[0]?.name}
                  onChange={(event) => setNewName(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="search-category">Category</label>
                <select
                  id="search-category"
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">Optional new category below</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              {!categoryId ? (
                <div className="field">
                  <label htmlFor="search-new-category">New category name</label>
                  <input
                    id="search-new-category"
                    type="text"
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <div className="field">
              <label htmlFor="existing-product">Existing product</label>
              <select
                id="existing-product"
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
                required
              >
                <option value="">Choose…</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
              {products.length === 0 ? (
                <p className="hint">No products on this list yet. Create a new one instead.</p>
              ) : null}
            </div>
          )}

          <div className="form-actions">
            <button type="submit" className="button primary" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Add to track list'}
            </button>
          </div>
          {feedback ? (
            <p className={`hint ${feedback.tone === 'error' ? 'error' : 'ok'}`} style={{ marginTop: 10 }}>
              {feedback.text}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
