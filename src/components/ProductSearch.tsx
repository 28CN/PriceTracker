'use client';

import { Check, Clock, ExternalLink, LoaderCircle, RotateCcw, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from 'react';

import ProductVisual from '@/components/ProductVisual';
import RetailerLogo from '@/components/RetailerLogo';
import { formatLastSeen, formatMoney } from '@/lib/format';
import type { ShopHit, ShopOffer } from '@/lib/productSearch';
import { cleanHttpUrl } from '@/lib/productUrl';
import {
  addRecentSearch,
  isNearIdenticalName,
  prepareCandidate,
  rankPreparedItems
} from '@/lib/searchMatch';
import { trackedSearchCandidate, type TrackedSearchItem } from '@/lib/trackedSearch';

type Limited = 'demo' | 'off' | 'user_day' | 'user_month' | 'site_day' | 'error';

type SearchApiResponse = {
  query?: string;
  shops?: ShopHit[];
  cached?: boolean;
  limited?: Limited;
  error?: string;
};

type CacheState = {
  query: string;
  loading: boolean;
  error: boolean;
  hits: ShopHit[];
};

type LiveState = {
  query: string;
  loading: boolean;
  error: boolean;
  hits: ShopHit[];
  limited: Limited | null;
  cached: boolean;
};

type FlatOption =
  | { kind: 'recent'; term: string }
  | { kind: 'own'; item: TrackedSearchItem }
  | { kind: 'shop'; hit: ShopHit };

const RECENT_STORAGE_KEY = 'pricetracker.recentSearches';
const CACHE_DEBOUNCE_MS = 350;
const MIN_CACHE_CHARS = 3;
const MAX_OWN_RESULTS = 5;

const LIMIT_TEXT: Record<Limited, string> = {
  demo: 'Make your own free list to search every shop.',
  off: 'Shop search is resting today.',
  user_day: "You've used today's searches. Try again tomorrow.",
  user_month: "You've used this month's searches.",
  site_day: 'Shop search is resting until tomorrow.',
  error: 'Shops did not answer. Please try again.'
};

const EMPTY_CACHE: CacheState = { query: '', loading: false, error: false, hits: [] };
const EMPTY_LIVE: LiveState = {
  query: '',
  loading: false,
  error: false,
  hits: [],
  limited: null,
  cached: false
};

const money = (value: number | null) => (value === null ? '' : formatMoney(value));

function urlKey(url: string): string {
  return cleanHttpUrl(url) || url.trim();
}

function readRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

function writeRecentSearches(items: string[]) {
  try {
    if (items.length === 0) {
      window.localStorage.removeItem(RECENT_STORAGE_KEY);
    } else {
      window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(items));
    }
  } catch {
    // Storage unavailable or full; UI still works.
  }
}

export default function ProductSearch({
  trackedItems = [],
  trackedUrls,
  isDemo = false,
  onSelectTracked
}: {
  trackedItems?: TrackedSearchItem[];
  trackedUrls?: string[];
  isDemo?: boolean;
  onSelectTracked?: (productId: string) => void;
}) {
  const router = useRouter();
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const recentHeadingId = `${baseId}-recent-heading`;
  const ownHeadingId = `${baseId}-own-heading`;
  const shopsHeadingId = `${baseId}-shops-heading`;

  const rootRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cacheAbortRef = useRef<AbortController | null>(null);
  const liveAbortRef = useRef<AbortController | null>(null);
  const cacheReqIdRef = useRef(0);
  const liveReqIdRef = useRef(0);

  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [listDismissed, setListDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [cacheState, setCacheState] = useState<CacheState>(EMPTY_CACHE);
  const [liveState, setLiveState] = useState<LiveState>(EMPTY_LIVE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [doneIds, setDoneIds] = useState<Map<string, string>>(() => new Map());

  useEffect(() => {
    setRecentSearches(readRecentSearches());
  }, []);

  // Cleanup in-flight requests on unmount.
  useEffect(() => {
    return () => {
      cacheAbortRef.current?.abort();
      liveAbortRef.current?.abort();
    };
  }, []);

  // Close empty-input recent dropdown when clicking outside the search widget.
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const trackedUrlSet = useMemo(() => {
    const urls = trackedUrls ?? trackedItems.flatMap((item) => item.urls);
    return new Set(urls.map(urlKey));
  }, [trackedUrls, trackedItems]);

  const urlToProductId = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of trackedItems) {
      for (const url of item.urls) {
        map.set(urlKey(url), item.id);
      }
    }
    return map;
  }, [trackedItems]);

  const preparedTracked = useMemo(
    () =>
      trackedItems.map((item) => ({
        item,
        prepared: prepareCandidate(trackedSearchCandidate(item))
      })),
    [trackedItems]
  );

  const trimmed = query.trim();

  // 1. Instant client-side filter of the user's own tracked items (no network).
  const ownMatches = useMemo(() => {
    if (!trimmed) return [];
    return rankPreparedItems(trimmed, preparedTracked, MAX_OWN_RESULTS).map((entry) => entry.item);
  }, [trimmed, preparedTracked]);

  const recordRecent = useCallback((term: string) => {
    const clean = term.trim();
    if (clean.length < 2) return;
    setRecentSearches((prev) => {
      const next = addRecentSearch(prev, clean, 5);
      writeRecentSearches(next);
      return next;
    });
  }, []);

  const clearRecent = useCallback(() => {
    setRecentSearches([]);
    writeRecentSearches([]);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }, []);

  const fetchCacheFor = useCallback(async (term: string) => {
    cacheAbortRef.current?.abort();
    const controller = new AbortController();
    cacheAbortRef.current = controller;
    const reqId = ++cacheReqIdRef.current;

    setCacheState({ query: term, loading: true, error: false, hits: [] });

    const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
      method: 'GET',
      signal: controller.signal
    }).catch(() => null);

    if (controller.signal.aborted || cacheReqIdRef.current !== reqId) return;

    const data = (await response?.json().catch(() => null)) as SearchApiResponse | null;
    if (controller.signal.aborted || cacheReqIdRef.current !== reqId) return;

    if (!response?.ok || !data) {
      setCacheState({ query: term, loading: false, error: true, hits: [] });
      return;
    }

    setCacheState({
      query: term,
      loading: false,
      error: false,
      hits: data.shops || []
    });
  }, []);

  // 2. Debounced (~350ms) free cache search once user types >= 3 chars.
  useEffect(() => {
    cacheAbortRef.current?.abort();
    cacheReqIdRef.current += 1;

    if (trimmed.length < MIN_CACHE_CHARS) {
      setCacheState(EMPTY_CACHE);
      return;
    }

    // If a live search already succeeded for this exact query, keep those results.
    if (liveState.query === trimmed && !liveState.error && !liveState.loading) {
      return;
    }

    const timer = window.setTimeout(() => {
      void fetchCacheFor(trimmed);
    }, CACHE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [trimmed, fetchCacheFor, liveState.query, liveState.error, liveState.loading]);

  // 3. Explicit paid live search (Enter or "Search shops" button).
  const runLiveSearch = useCallback(
    async (explicitQuery?: string) => {
      const nextQuery = (explicitQuery ?? query).trim();
      if (!nextQuery) return;

      cacheAbortRef.current?.abort();
      cacheReqIdRef.current += 1;
      liveAbortRef.current?.abort();

      const controller = new AbortController();
      liveAbortRef.current = controller;
      const reqId = ++liveReqIdRef.current;

      setListDismissed(false);
      setOpenId(null);
      setActiveIndex(-1);
      recordRecent(nextQuery);

      setLiveState((prev) => ({
        query: nextQuery,
        loading: true,
        error: false,
        hits: prev.query === nextQuery ? prev.hits : [],
        limited: null,
        cached: false
      }));

      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: nextQuery }),
        signal: controller.signal
      }).catch(() => null);

      if (controller.signal.aborted || liveReqIdRef.current !== reqId) return;

      const data = (await response?.json().catch(() => null)) as SearchApiResponse | null;
      if (controller.signal.aborted || liveReqIdRef.current !== reqId) return;

      if (response?.ok && data) {
        setLiveState({
          query: nextQuery,
          loading: false,
          error: false,
          hits: data.shops || [],
          limited: data.limited ?? null,
          cached: Boolean(data.cached)
        });
        return;
      }

      setLiveState((prev) => ({
        query: nextQuery,
        loading: false,
        error: true,
        hits: prev.query === nextQuery ? prev.hits : [],
        limited: 'error',
        cached: false
      }));
    },
    [query, recordRecent]
  );

  const hasLiveForQuery = trimmed.length > 0 && liveState.query === trimmed;
  const hasCacheForQuery = trimmed.length >= MIN_CACHE_CHARS && cacheState.query === trimmed;
  const shops = useMemo(
    () => (hasLiveForQuery ? liveState.hits : hasCacheForQuery ? cacheState.hits : []),
    [hasLiveForQuery, liveState.hits, hasCacheForQuery, cacheState.hits]
  );
  const isLiveLoading = hasLiveForQuery && liveState.loading;
  const isCacheLoading = !hasLiveForQuery && hasCacheForQuery && cacheState.loading;
  const limited = hasLiveForQuery ? liveState.limited : null;
  const errorSource: 'live' | 'cache' | null =
    hasLiveForQuery && liveState.error
      ? 'live'
      : !hasLiveForQuery && hasCacheForQuery && cacheState.error
        ? 'cache'
        : null;

  // Match shop hits against tracked URLs or near-identical product names.
  const trackedMatchByHitId = useMemo(() => {
    const matches = new Map<string, string>();
    for (const hit of shops) {
      if (hit.url) {
        const key = urlKey(hit.url);
        const byUrl = urlToProductId.get(key);
        if (byUrl) {
          matches.set(hit.id, byUrl);
          continue;
        }
        if (trackedUrlSet.has(key)) {
          matches.set(hit.id, '');
          continue;
        }
      }
      const near = trackedItems.find((item) => isNearIdenticalName(hit.name, item.name));
      if (near) {
        matches.set(hit.id, near.id);
      }
    }
    return matches;
  }, [shops, trackedItems, trackedUrlSet, urlToProductId]);

  const showRecent = !trimmed && focused && !listDismissed && recentSearches.length > 0;
  const showResultsPanel = trimmed.length > 0 && !listDismissed;
  const isListOpen = showRecent || showResultsPanel;

  const flatOptions = useMemo<FlatOption[]>(() => {
    if (showRecent) {
      return recentSearches.map((term) => ({ kind: 'recent', term }));
    }
    if (!showResultsPanel) return [];
    return [
      ...ownMatches.map((item): FlatOption => ({ kind: 'own', item })),
      ...shops.map((hit): FlatOption => ({ kind: 'shop', hit }))
    ];
  }, [showRecent, recentSearches, showResultsPanel, ownMatches, shops]);

  useEffect(() => {
    if (activeIndex >= flatOptions.length) {
      setActiveIndex(flatOptions.length > 0 ? flatOptions.length - 1 : -1);
    }
  }, [activeIndex, flatOptions.length]);

  const activeOptionId =
    isListOpen && activeIndex >= 0 && activeIndex < flatOptions.length
      ? `${listboxId}-opt-${activeIndex}`
      : undefined;

  useEffect(() => {
    if (!activeOptionId) return;
    const node = document.getElementById(activeOptionId);
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeOptionId]);

  const jumpToTracked = useCallback(
    (productId: string) => {
      if (trimmed.length >= 2) {
        recordRecent(trimmed);
      }
      setListDismissed(true);
      setActiveIndex(-1);
      setOpenId(null);

      if (onSelectTracked) {
        try {
          window.history.replaceState(null, '', `#p-${productId}`);
        } catch {
          // ignore
        }
        onSelectTracked(productId);
        return;
      }

      const card = document.getElementById(`p-${productId}`);
      if (card) {
        const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        card.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
        card.classList.remove('is-highlight');
        void card.offsetWidth;
        card.classList.add('is-highlight');
        card.focus({ preventScroll: true });
        window.setTimeout(() => card.classList.remove('is-highlight'), 1800);
        return;
      }

      router.push(`/#p-${productId}`);
    },
    [trimmed, recordRecent, onSelectTracked, router]
  );

  const selectRecent = useCallback((term: string) => {
    setQuery(term);
    setListDismissed(false);
    setActiveIndex(-1);
    setOpenId(null);
    inputRef.current?.focus();
  }, []);

  const clearAll = useCallback(() => {
    cacheAbortRef.current?.abort();
    liveAbortRef.current?.abort();
    cacheReqIdRef.current += 1;
    liveReqIdRef.current += 1;
    setQuery('');
    setCacheState(EMPTY_CACHE);
    setLiveState(EMPTY_LIVE);
    setOpenId(null);
    setActiveIndex(-1);
    setListDismissed(false);
    inputRef.current?.focus();
  }, []);

  const activateOption = useCallback(
    (option: FlatOption) => {
      if (option.kind === 'recent') {
        selectRecent(option.term);
        return;
      }
      if (option.kind === 'own') {
        jumpToTracked(option.item.id);
        return;
      }
      if (trimmed.length >= 2) {
        recordRecent(trimmed);
      }
      setOpenId((current) => (current === option.hit.id ? null : option.hit.id));
    },
    [selectRecent, jumpToTracked, trimmed, recordRecent]
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmed) {
      void runLiveSearch(trimmed);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (listDismissed) {
        setListDismissed(false);
      }
      if (flatOptions.length > 0) {
        setActiveIndex((current) => (current + 1) % flatOptions.length);
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (listDismissed) {
        setListDismissed(false);
      }
      if (flatOptions.length > 0) {
        setActiveIndex((current) => (current <= 0 ? flatOptions.length - 1 : current - 1));
      }
      return;
    }

    if (event.key === 'Enter') {
      if (isListOpen && activeIndex >= 0 && activeIndex < flatOptions.length) {
        event.preventDefault();
        activateOption(flatOptions[activeIndex]);
        return;
      }
      if (trimmed) {
        event.preventDefault();
        void runLiveSearch(trimmed);
      }
      return;
    }

    if (event.key === 'Escape') {
      if (isListOpen) {
        event.preventDefault();
        setListDismissed(true);
        setActiveIndex(-1);
        setOpenId(null);
      } else if (query.length > 0) {
        event.preventDefault();
        clearAll();
      }
    }
  }

  // Live status announcement text for screen readers and subtle status line.
  const statusAnnouncement = useMemo(() => {
    if (isLiveLoading) return 'Searching shops…';
    if (!trimmed || listDismissed) return '';
    if (errorSource) return 'Shops did not answer.';

    const parts: string[] = [];
    if (ownMatches.length > 0) {
      parts.push(`${ownMatches.length} on your list`);
    }
    if (shops.length > 0) {
      parts.push(`${shops.length} from other shops`);
    }

    if (limited && limited !== 'error') {
      const limitMsg = LIMIT_TEXT[limited];
      return parts.length > 0 ? `${parts.join(', ')}. ${limitMsg}` : limitMsg;
    }

    if (isCacheLoading) {
      return parts.length > 0 ? `${parts.join(', ')}. Checking other shops…` : 'Checking other shops…';
    }

    if (parts.length > 0) return parts.join(', ');
    return 'No matches on your list';
  }, [isLiveLoading, trimmed, listDismissed, errorSource, ownMatches.length, shops.length, limited, isCacheLoading]);

  const showEmptyOwnState =
    showResultsPanel &&
    ownMatches.length === 0 &&
    shops.length === 0 &&
    !isLiveLoading &&
    !isCacheLoading &&
    !errorSource;

  const showGoogleFallback =
    showResultsPanel &&
    trimmed.length > 0 &&
    (Boolean(limited) ||
      Boolean(errorSource) ||
      (hasLiveForQuery && !isLiveLoading && shops.length === 0) ||
      showEmptyOwnState);

  const ownStartIndex = 0;
  const shopStartIndex = ownMatches.length;

  return (
    <section
      ref={rootRef}
      className="product-search card"
      aria-label="Search your list or shops"
      aria-busy={isLiveLoading || isCacheLoading}
    >
      <form onSubmit={handleSubmit} role="search" className="product-search-form">
        <div className="product-search-field">
          <Search className="product-search-icon" size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            className="product-search-input"
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isListOpen}
            aria-controls={listboxId}
            aria-activedescendant={activeOptionId}
            aria-label="Search your list or shops"
            value={query}
            onFocus={() => {
              setFocused(true);
              setListDismissed(false);
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setListDismissed(false);
              setActiveIndex(-1);
              setOpenId(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search your list or shops"
            maxLength={120}
          />
          {query.length > 0 ? (
            <button
              type="button"
              className="product-search-clear-icon"
              aria-label="Clear search"
              onClick={clearAll}
            >
              <X size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <button
          className="button primary"
          type="submit"
          disabled={isLiveLoading || !trimmed}
        >
          {isLiveLoading ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : null}
          {isLiveLoading ? 'Searching…' : 'Search shops'}
        </button>
      </form>

      <div className="product-search-status" role="status" aria-live="polite">
        {statusAnnouncement ? (
          <span
            className={
              showEmptyOwnState
                ? 'visually-hidden'
                : limited || errorSource
                  ? 'product-search-status-warn'
                  : undefined
            }
          >
            {statusAnnouncement}
          </span>
        ) : null}
      </div>

      {isListOpen ? (
        <div id={listboxId} role="listbox" aria-label="Search results" className="product-search-panel">
          {showRecent ? (
            <div role="group" aria-labelledby={recentHeadingId} className="product-search-group">
              <div className="product-search-group-head">
                <span id={recentHeadingId} className="product-search-group-label">
                  Recent
                </span>
                <button
                  type="button"
                  className="product-search-clear-recent"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={clearRecent}
                >
                  Clear
                </button>
              </div>
              <div className="product-search-recent-list">
                {recentSearches.map((term, idx) => {
                  const isActive = activeIndex === idx;
                  return (
                    <div
                      key={term}
                      id={`${listboxId}-opt-${idx}`}
                      role="option"
                      aria-selected={isActive}
                      className={`product-search-recent-item${isActive ? ' is-active' : ''}`}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectRecent(term)}
                    >
                      <Clock size={14} aria-hidden="true" />
                      <span>{term}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {showResultsPanel && ownMatches.length > 0 ? (
            <div role="group" aria-labelledby={ownHeadingId} className="product-search-group">
              <div className="product-search-group-head">
                <span id={ownHeadingId} className="product-search-group-label">
                  On your list
                </span>
              </div>
              <div className="product-search-own-list">
                {ownMatches.map((item, idx) => {
                  const optIndex = ownStartIndex + idx;
                  const isActive = activeIndex === optIndex;
                  const staleLabel = item.stalePrice !== null ? formatLastSeen(item.lastSeenAt) : '';
                  return (
                    <div
                      key={item.id}
                      id={`${listboxId}-opt-${optIndex}`}
                      role="option"
                      aria-selected={isActive}
                      className={`product-search-own-row${isActive ? ' is-active' : ''}`}
                      onMouseEnter={() => setActiveIndex(optIndex)}
                      onClick={() => jumpToTracked(item.id)}
                    >
                      <span className="product-search-own-thumb">
                        <ProductVisual source={item.thumb} name={item.name} />
                      </span>
                      <span className="product-search-text">
                        <strong>{item.name}</strong>
                        {item.shop ? (
                          <span>
                            <RetailerLogo retailer={item.shop} />
                            {item.shop}
                          </span>
                        ) : null}
                      </span>
                      <span className="product-search-own-price">
                        {item.price !== null ? (
                          <b>{formatMoney(item.price)}</b>
                        ) : item.stalePrice !== null ? (
                          <>
                            <b className="is-stale">{formatMoney(item.stalePrice)}</b>
                            {staleLabel ? <small>Last seen {staleLabel}</small> : null}
                          </>
                        ) : (
                          <small>No price yet</small>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {showResultsPanel && (shops.length > 0 || isLiveLoading || isCacheLoading) ? (
            <div role="group" aria-labelledby={shopsHeadingId} className="product-search-group">
              <div className="product-search-group-head">
                <span id={shopsHeadingId} className="product-search-group-label">
                  Other shops
                </span>
                {isCacheLoading || isLiveLoading ? (
                  <span className="product-search-group-meta">
                    <LoaderCircle className="spin" size={14} aria-hidden="true" />
                    {isLiveLoading ? 'Searching…' : 'Checking…'}
                  </span>
                ) : null}
              </div>

              {(isLiveLoading || isCacheLoading) && shops.length === 0 ? (
                <div className="product-search-results" aria-hidden="true">
                  {[0, 1, 2].map((n) => (
                    <div key={n} className="product-search-skel" />
                  ))}
                </div>
              ) : null}

              {shops.length > 0 ? (
                <div className="product-search-results">
                  {shops.map((hit, idx) => {
                    const optIndex = shopStartIndex + idx;
                    const isActive = activeIndex === optIndex;
                    const trackedId = trackedMatchByHitId.get(hit.id);
                    return (
                      <SearchHitCard
                        key={hit.id}
                        optionId={`${listboxId}-opt-${optIndex}`}
                        active={isActive}
                        hit={hit}
                        open={openId === hit.id}
                        doneId={doneIds.get(hit.id) ?? null}
                        trackedMatchId={trackedId ?? null}
                        isAlreadyTracked={trackedId !== undefined}
                        isDemo={isDemo}
                        tracked={trackedUrlSet}
                        onHover={() => setActiveIndex(optIndex)}
                        onJumpTracked={jumpToTracked}
                        onToggle={() => {
                          if (trimmed.length >= 2) recordRecent(trimmed);
                          setOpenId((current) => (current === hit.id ? null : hit.id));
                        }}
                        onDone={(productId) => {
                          setDoneIds((current) => new Map(current).set(hit.id, productId));
                          setOpenId(null);
                        }}
                      />
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {showEmptyOwnState ? (
            <div className="product-search-empty">
              <p>No matches on your list</p>
              <div className="product-search-empty-actions">
                {!hasLiveForQuery ? (
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => void runLiveSearch(trimmed)}
                  >
                    Search shops
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {errorSource ? (
            <div className="product-search-error">
              <p>Shops did not answer.</p>
              <button
                type="button"
                className="button"
                onClick={() => {
                  if (errorSource === 'live') {
                    void runLiveSearch(trimmed);
                  } else {
                    void fetchCacheFor(trimmed);
                  }
                }}
              >
                <RotateCcw size={14} aria-hidden="true" />
                Try again
              </button>
            </div>
          ) : null}

          {showGoogleFallback ? (
            <div className="product-search-footer">
              <a
                className="button secondary search-fallback"
                href={`https://www.google.com.au/search?tbm=shop&q=${encodeURIComponent(trimmed)}`}
                target="_blank"
                rel="noreferrer"
              >
                Search Google Shopping <ExternalLink size={14} aria-hidden="true" />
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SearchHitCard({
  optionId,
  active,
  hit,
  open,
  doneId,
  trackedMatchId,
  isAlreadyTracked,
  isDemo,
  tracked,
  onHover,
  onJumpTracked,
  onToggle,
  onDone
}: {
  optionId: string;
  active: boolean;
  hit: ShopHit;
  open: boolean;
  doneId: string | null;
  trackedMatchId: string | null;
  isAlreadyTracked: boolean;
  isDemo: boolean;
  tracked: Set<string>;
  onHover: () => void;
  onJumpTracked: (productId: string) => void;
  onToggle: () => void;
  onDone: (productId: string) => void;
}) {
  const staleDate = hit.stale && hit.fetchedAt ? formatLastSeen(hit.fetchedAt) : '';

  return (
    <article
      className={`product-search-hit${open ? ' is-open' : ''}${active ? ' is-active' : ''}`}
    >
      <div
        id={optionId}
        role="option"
        aria-selected={active}
        className="product-search-row"
        onMouseEnter={onHover}
      >
        {hit.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary retailer image hosts
          <img src={hit.imageUrl} alt="" width={64} height={64} loading="lazy" />
        ) : (
          <span className="product-search-photo" aria-hidden="true" />
        )}
        <div className="product-search-text">
          <strong>{hit.name}</strong>
          <span className="product-search-meta-row">
            <span className="product-search-shop-label">
              <RetailerLogo retailer={hit.shop} />
              {hit.shop}
            </span>
            {isAlreadyTracked && !doneId ? (
              trackedMatchId ? (
                <button
                  type="button"
                  className="product-search-onlist-mark"
                  onClick={(event) => {
                    event.stopPropagation();
                    onJumpTracked(trackedMatchId);
                  }}
                >
                  <Check size={12} aria-hidden="true" /> On your list
                </button>
              ) : (
                <span className="product-search-onlist-mark">
                  <Check size={12} aria-hidden="true" /> On your list
                </span>
              )
            ) : null}
          </span>
        </div>
        <b className={`product-search-price${staleDate ? ' is-stale' : ''}`}>
          {hit.price === null ? 'No price yet' : money(hit.price)}
          <small>{staleDate ? `Prices from ${staleDate}` : 'Listed price'}</small>
        </b>
        {doneId ? (
          <span className="product-search-done" role="status">
            <Check size={15} aria-hidden="true" /> Tracked
            <a
              href={`#p-${doneId}`}
              onClick={(event) => {
                event.preventDefault();
                onJumpTracked(doneId);
              }}
            >
              View on my list
            </a>
          </span>
        ) : (
          <button
            className={`button ${hit.supported ? 'primary' : ''}`}
            type="button"
            aria-expanded={open}
            onClick={onToggle}
          >
            {open ? 'Close' : hit.supported ? 'Track' : 'View shops'}
            {open ? <X size={15} aria-hidden="true" /> : null}
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
  onDone: (productId: string) => void;
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
      setPicked(
        new Set(
          list
            .filter((offer) => offer.trackable && !tracked.has(urlKey(offer.url)))
            .map((offer) => offer.url)
        )
      );
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
        imageUrl: hit.imageUrl,
        links: offers
          .filter((offer) => picked.has(offer.url))
          .map((offer) => ({ url: offer.url, retailer: offer.shop }))
      })
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as {
      error?: string;
      productId?: string;
    } | null;
    setSaving(false);
    if (!response?.ok) {
      setError(data?.error || 'Could not add it. Please try again.');
      return;
    }
    const productId = data?.productId || '';
    onDone(productId);
    if (productId) {
      void fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId })
      }).catch(() => null);
    }
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
          <button
            className="button primary"
            type="button"
            disabled={saving || picked.size === 0}
            onClick={save}
          >
            {saving ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : null}
            {saving ? 'Adding…' : 'Start tracking'}
          </button>
        </div>
      ) : null}
      {error ? <p className="hint error">{error}</p> : null}
    </div>
  );
}
