'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

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

export default function SearchPanel({
  listKind,
  products,
  categories
}: {
  listKind: ListKind;
  products: ProductView[];
  categories: CategoryView[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
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

  const selectedHits = useMemo(() => Object.values(selected), [selected]);

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

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2 || selectedShops.length === 0) {
      return;
    }

    setIsSearching(true);
    setFeedback(null);
    setResults([]);
    setSelected({});

    const settled = await Promise.all(
      selectedShops.map(async (retailer) => {
        try {
          const response = await fetch(
            `/api/search?retailer=${encodeURIComponent(retailer)}&q=${encodeURIComponent(q)}`
          );
          const data = (await response.json()) as ShopSearchResult & { error?: string };
          if (!response.ok) {
            const shop = SEARCH_RETAILERS.find((item) => item.id === retailer);
            return {
              retailer: shop?.name || retailer,
              retailerId: retailer,
              results: [],
              fallbackUrl: shop?.fallbackUrl(q) || '',
              error: data.error || 'Search failed.'
            } satisfies ShopSearchResult;
          }
          return data;
        } catch (error) {
          const shop = SEARCH_RETAILERS.find((item) => item.id === retailer);
          return {
            retailer: shop?.name || retailer,
            retailerId: retailer,
            results: [],
            fallbackUrl: shop?.fallbackUrl(q) || '',
            error: error instanceof Error ? error.message : 'Search failed.'
          } satisfies ShopSearchResult;
        }
      })
    );

    setResults(settled);
    setIsSearching(false);
  }

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
        setFeedback({ tone: 'ok', text: `Added ${links.length} link(s). Prices appear on the next crawl.` });
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
    <div>
      <h2 className="section-title">Search shops · {LIST_LABELS[listKind]}</h2>
      <form className="card" onSubmit={runSearch}>
        <div className="field">
          <label htmlFor="beta-search-q">Product name</label>
          <input
            id="beta-search-q"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Panadol, Makita drill, full cream milk"
            required
            minLength={2}
          />
        </div>

        <p className="section-title" style={{ marginTop: 4 }}>
          Shops
        </p>
        <div className="shop-checks">
          {SEARCH_RETAILERS.map((shop) => (
            <label key={shop.id} className="shop-check">
              <input
                type="checkbox"
                checked={selectedShops.includes(shop.id)}
                onChange={() => toggleShop(shop.id)}
              />
              <span>{shop.name}</span>
              {shop.defaultOn ? <span className="chip">default</span> : null}
            </label>
          ))}
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className="button primary"
            disabled={isSearching || selectedShops.length === 0}
          >
            {isSearching ? 'Searching…' : 'Search from this server'}
          </button>
          <button
            type="button"
            className="button"
            disabled={query.trim().length < 2 || selectedShops.length === 0}
            onClick={openInShops}
          >
            Open shops in my browser
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
          Search from this server uses Vercel’s IP, which Coles / Woolworths / Bunnings often
          refuse (403). That is not a ban of this site, and trying again tomorrow will not change
          it. “Open shops in my browser” and Google Shopping use your home connection, like a
          normal customer.
        </p>
      </form>

      <form
        className="card"
        style={{ marginTop: 12 }}
        onSubmit={(event) => {
          event.preventDefault();
          addPastedUrls();
        }}
      >
        <p className="section-title" style={{ margin: 0 }}>
          Or paste product page URLs
        </p>
        <p className="hint" style={{ marginTop: 6 }}>
          After you find the right item on the shop (or Google), copy the product page link here.
          Then save it to this list like a search card.
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

      {results.map((block) => (
        <section key={block.retailerId} className="search-shop">
          <div className="search-shop-head">
            <h3>
              <RetailerLogo retailer={block.retailer} />
              {block.retailer}
            </h3>
            {block.fallbackUrl ? (
              <a href={block.fallbackUrl} target="_blank" rel="noreferrer">
                Open shop search
              </a>
            ) : null}
          </div>
          {block.error ? <p className="hint error">{block.error}</p> : null}
          {block.results.length > 0 ? (
            <div className="search-grid">
              {block.results.map((hit) => {
                const key = hitKey(hit);
                const isOn = Boolean(selected[key]);
                return (
                  <article key={key} className={`search-card${isOn ? ' is-selected' : ''}`}>
                    <label className="search-card-pick">
                      <input
                        type="checkbox"
                        checked={isOn}
                        onChange={() => toggleHit(hit)}
                      />
                      Select
                    </label>
                    {hit.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={hit.imageUrl} alt="" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="search-card-ph">No image</div>
                    )}
                    <p className="search-card-name">{hit.name}</p>
                    <p className="search-card-price">
                      {hit.price === null ? 'Price on site' : formatMoney(hit.price)}
                    </p>
                    <a href={hit.url} target="_blank" rel="noreferrer">
                      Open on {hit.retailer}
                    </a>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      ))}

      {selectedHits.length > 0 ? (
        <form className="card" onSubmit={saveSelected} style={{ marginTop: 16 }}>
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
