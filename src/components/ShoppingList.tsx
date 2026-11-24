'use client';

import { ArrowUpRight, Share2, Search, X } from 'lucide-react';
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';

import InfoTip from '@/components/InfoTip';
import ProductVisual from '@/components/ProductVisual';
import RetailerLogo from '@/components/RetailerLogo';
import { formatLastSeen, formatMoney } from '@/lib/format';
import { productThumb } from '@/lib/productImage';
import {
  filterProductsByQuery,
  hasWednesdaySpecials,
  lowestListText,
  lowestPriceRows,
  SHOP_RECENT_DAYS,
  shopGroups,
  shopListText,
  shopTotal,
  type LowestRow,
  type LowestSort,
  type ShopItem
} from '@/lib/shoppingList';
import type { ProductView } from '@/lib/types';

export type ShoppingListTab = 'lowest' | 'shop';

function replaceListUrl(tab: ShoppingListTab, shopKey: string | null) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (tab === 'shop') {
    url.searchParams.set('list', 'shop');
    if (shopKey) url.searchParams.set('shop', shopKey);
    else url.searchParams.delete('shop');
  } else {
    url.searchParams.set('list', 'lowest');
    url.searchParams.delete('shop');
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== current) {
    window.history.replaceState(window.history.state, '', next);
  }
}

function clearListUrl() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('list') && !url.searchParams.has('shop')) return;
  url.searchParams.delete('list');
  url.searchParams.delete('shop');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function LowestRowItem({ row, referenceNow }: { row: LowestRow; referenceNow: number }) {
  const thumb = productThumb(row.product, row.link?.id);
  const href = row.link?.url || null;
  const content = (
    <>
      <span className="sl-thumb">
        <ProductVisual source={thumb} name={row.product.name} category={row.product.categoryName} />
      </span>
      <span className="sl-row-main">
        <strong className="sl-name">{row.product.name}</strong>
        <span className="sl-meta">
          {row.retailers.length > 0 ? (
            <span className="sl-shop">{row.retailers.join(' · ')}</span>
          ) : null}
          {row.product.targetPrice !== null ? (
            <span className="sl-goal">Goal {formatMoney(row.product.targetPrice)}</span>
          ) : null}
          {row.belowGoal ? <span className="sl-badge is-success">Below goal</span> : null}
        </span>
      </span>
      <span className="sl-row-price">
        {row.price !== null ? (
          <>
            <span className="sl-price-line">
              <strong
                className={`sl-price${row.stale ? ' is-stale' : row.belowGoal ? ' is-deal' : ''}`}
              >
                {formatMoney(row.price)}
              </strong>
              {href ? <ArrowUpRight className="sl-ext" size={14} aria-hidden="true" /> : null}
            </span>
            {row.stale && row.lastSeenAt ? (
              <small className="sl-last-seen">
                Last seen{' '}
                <time dateTime={row.lastSeenAt}>
                  {formatLastSeen(row.lastSeenAt, referenceNow)}
                </time>
              </small>
            ) : null}
          </>
        ) : row.unavailable ? (
          <span className="sl-state">Unavailable</span>
        ) : (
          <span className="sl-state">No price yet</span>
        )}
      </span>
    </>
  );

  return (
    <li className="sl-item">
      {href ? (
        <a className="sl-row is-link" href={href} target="_blank" rel="noreferrer">
          {content}
        </a>
      ) : (
        <div className="sl-row">{content}</div>
      )}
    </li>
  );
}

function ShopRowItem({ item, referenceNow }: { item: ShopItem; referenceNow: number }) {
  const thumb = productThumb(item.product, item.link.id);
  const href = item.link.url || null;
  const content = (
    <>
      <span className="sl-thumb">
        <ProductVisual source={thumb} name={item.product.name} category={item.product.categoryName} />
      </span>
      <span className="sl-row-main">
        <strong className="sl-name">{item.product.name}</strong>
        <span className="sl-meta">
          {item.cheapest ? <span className="sl-badge is-cheapest">Cheapest</span> : null}
          {item.belowGoal ? <span className="sl-badge is-success">Below goal</span> : null}
          {item.product.targetPrice !== null ? (
            <span className="sl-goal">Goal {formatMoney(item.product.targetPrice)}</span>
          ) : null}
        </span>
      </span>
      <span className="sl-row-price">
        <span className="sl-price-line">
          <strong
            className={`sl-price${item.stale ? ' is-stale' : item.belowGoal ? ' is-deal' : ''}`}
          >
            {formatMoney(item.price)}
          </strong>
          {href ? <ArrowUpRight className="sl-ext" size={14} aria-hidden="true" /> : null}
        </span>
        {item.stale && item.link.latestAt ? (
          <small className="sl-last-seen">
            Last seen{' '}
            <time dateTime={item.link.latestAt}>
              {formatLastSeen(item.link.latestAt, referenceNow)}
            </time>
          </small>
        ) : null}
      </span>
    </>
  );

  return (
    <li className="sl-item">
      {href ? (
        <a className="sl-row is-link" href={href} target="_blank" rel="noreferrer">
          {content}
        </a>
      ) : (
        <div className="sl-row">{content}</div>
      )}
    </li>
  );
}

function ShoppingListContent({
  products,
  referenceNow,
  initialTab,
  initialShop,
  titleId,
  onClose
}: {
  products: ProductView[];
  referenceNow: number;
  initialTab: ShoppingListTab;
  initialShop: string | null;
  titleId: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ShoppingListTab>(initialTab);
  const [sort, setSort] = useState<LowestSort>('deals');
  const [selectedShop, setSelectedShop] = useState<string | null>(initialShop);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const lowestTabId = useId();
  const shopTabId = useId();
  const lowestPanelId = useId();
  const shopPanelId = useId();
  const lowestTabRef = useRef<HTMLButtonElement>(null);
  const shopTabRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const hasQuery = deferredQuery.trim().length > 0;
  const filteredProducts = useMemo(
    () => filterProductsByQuery(products, deferredQuery),
    [products, deferredQuery]
  );

  const rows = useMemo(() => lowestPriceRows(filteredProducts, sort), [filteredProducts, sort]);
  const allGroups = useMemo(() => shopGroups(products, referenceNow), [products, referenceNow]);
  const groups = useMemo(() => {
    if (!hasQuery) return allGroups;
    const matchedIds = new Set(filteredProducts.map((product) => product.id));
    return allGroups.map((group) => ({
      ...group,
      items: group.items.filter((item) => matchedIds.has(item.product.id))
    }));
  }, [allGroups, filteredProducts, hasQuery]);

  const activeGroup = useMemo(() => {
    if (groups.length === 0) return null;
    if (selectedShop) {
      const matched = groups.find((group) => group.key === selectedShop);
      if (matched && (!hasQuery || matched.items.length > 0)) return matched;
    }
    return groups.find((group) => group.items.length > 0) ?? groups[0];
  }, [groups, selectedShop, hasQuery]);

  const activeShopKey = activeGroup?.key ?? null;

  useEffect(() => {
    replaceListUrl(tab, activeShopKey);
  }, [tab, activeShopKey]);

  async function shareList() {
    const day = (iso: string) => formatLastSeen(iso, referenceNow);
    const text =
      tab === 'shop' && activeGroup
        ? shopListText(activeGroup, activeGroup.items, formatMoney, day)
        : lowestListText(rows, formatMoney, day);
    try {
      if (typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: 'Shopping list', text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setShareNote('Copied');
    } catch (error) {
      // Closing the share sheet is not a failure.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareNote('Could not copy');
    }
    window.setTimeout(() => setShareNote(null), 2000);
  }

  function switchTab(next: ShoppingListTab, moveFocus = false) {
    setTab(next);
    if (moveFocus) {
      if (next === 'lowest') lowestTabRef.current?.focus();
      else shopTabRef.current?.focus();
    }
  }

  return (
    <>
      <header className="deal-dialog-head sl-head">
        <h2 id={titleId}>Shopping list</h2>
        <span className="sl-share-note" role="status" aria-live="polite">
          {shareNote}
        </span>
        <button type="button" className="icon-button" onClick={shareList} aria-label="Share list">
          <Share2 size={16} aria-hidden="true" />
        </button>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="sl-scroll">
        <div className="sl-sticky">
          <div className="sl-search">
            <Search className="sl-search-icon" size={16} aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="search"
              className="sl-search-input"
              aria-label="Search the list"
              placeholder="Search the list"
              autoComplete="off"
              spellCheck={false}
              maxLength={120}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && query.length > 0) {
                  event.preventDefault();
                  event.stopPropagation();
                  setQuery('');
                }
              }}
            />
            {query.length > 0 ? (
              <button
                type="button"
                className="sl-search-clear"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('');
                  searchInputRef.current?.focus();
                }}
              >
                <X size={15} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div className="sl-tabs-row">
            <div
              className="sl-tabs"
              role="tablist"
              aria-labelledby={titleId}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                  event.preventDefault();
                  switchTab(tab === 'lowest' ? 'shop' : 'lowest', true);
                } else if (event.key === 'Home') {
                  event.preventDefault();
                  switchTab('lowest', true);
                } else if (event.key === 'End') {
                  event.preventDefault();
                  switchTab('shop', true);
                }
              }}
            >
              <button
                ref={lowestTabRef}
                id={lowestTabId}
                type="button"
                role="tab"
                className={`sl-tab${tab === 'lowest' ? ' is-active' : ''}`}
                aria-selected={tab === 'lowest'}
                aria-controls={lowestPanelId}
                tabIndex={tab === 'lowest' ? 0 : -1}
                onClick={() => switchTab('lowest')}
              >
                Lowest prices
              </button>
              <button
                ref={shopTabRef}
                id={shopTabId}
                type="button"
                role="tab"
                className={`sl-tab${tab === 'shop' ? ' is-active' : ''}`}
                aria-selected={tab === 'shop'}
                aria-controls={shopPanelId}
                tabIndex={tab === 'shop' ? 0 : -1}
                onClick={() => switchTab('shop')}
              >
                By shop
              </button>
            </div>

            {tab === 'lowest' ? (
              <div className="sl-sort" role="group" aria-label="Sort">
                <button
                  type="button"
                  className={`sl-sort-btn${sort === 'deals' ? ' is-active' : ''}`}
                  aria-pressed={sort === 'deals'}
                  onClick={() => setSort('deals')}
                >
                  Deals first
                </button>
                <button
                  type="button"
                  className={`sl-sort-btn${sort === 'name' ? ' is-active' : ''}`}
                  aria-pressed={sort === 'name'}
                  onClick={() => setSort('name')}
                >
                  A–Z
                </button>
              </div>
            ) : null}
          </div>

          {tab === 'shop' ? (
            <div className="sl-shop-bar">
              <div className="sl-chips" role="group" aria-label="Shops">
                {groups.map((group) => {
                  const count = group.items.length;
                  const selected = count > 0 && group.key === activeShopKey;
                  return (
                    <button
                      key={group.key}
                      type="button"
                      className={`sl-chip${selected ? ' is-selected' : ''}`}
                      disabled={count === 0}
                      aria-pressed={selected}
                      onClick={() => setSelectedShop(group.key)}
                    >
                      <RetailerLogo retailer={group.name} url={group.sampleUrl} />
                      <span className="sl-chip-name">{group.name}</span>
                      <span className="sl-chip-count">{count}</span>
                    </button>
                  );
                })}
              </div>
              <InfoTip label="Which items are shown">
                Only items this shop priced in the last {SHOP_RECENT_DAYS} days.
                {hasWednesdaySpecials(activeShopKey) ? ' New specials start every Wednesday.' : null}
              </InfoTip>
            </div>
          ) : null}
        </div>

        {tab === 'lowest' ? (
          <div
            id={lowestPanelId}
            role="tabpanel"
            aria-labelledby={lowestTabId}
            className="sl-body"
          >
            {rows.length > 0 ? (
              <ul className="sl-list">
                {rows.map((row) => (
                  <LowestRowItem key={row.product.id} row={row} referenceNow={referenceNow} />
                ))}
              </ul>
            ) : (
              <div className="sl-empty">
                <p>{hasQuery ? 'No matches' : 'Nothing tracked yet'}</p>
              </div>
            )}
          </div>
        ) : (
          <div
            id={shopPanelId}
            role="tabpanel"
            aria-labelledby={shopTabId}
            className="sl-body"
          >
            {activeGroup && activeGroup.items.length > 0 ? (
              <>
              <ul className="sl-list">
                {activeGroup.items.map((item) => (
                  <ShopRowItem
                    key={`${activeGroup.key}-${item.product.id}`}
                    item={item}
                    referenceNow={referenceNow}
                  />
                ))}
              </ul>
              <p className="sl-total">
                <span>Total</span>
                <strong>{formatMoney(shopTotal(activeGroup.items))}</strong>
              </p>
              </>
            ) : (
              <div className="sl-empty">
                <p>
                  {hasQuery
                    ? 'No matches'
                    : `Nothing priced here in the last ${SHOP_RECENT_DAYS} days`}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default function ShoppingList({
  open,
  products,
  referenceNow,
  initialTab = 'lowest',
  initialShop = null,
  onClose
}: {
  open: boolean;
  products: ProductView[];
  referenceNow: number;
  initialTab?: ShoppingListTab;
  initialShop?: string | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const hasOpenedRef = useRef(false);
  const titleId = useId();

  useEffect(() => {
    dialogRef.current?.setAttribute('closedby', 'any');
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      hasOpenedRef.current = true;
      if (typeof dialog.showModal === 'function' && !dialog.open) {
        dialog.showModal();
      }
      return;
    }
    if (dialog.open) dialog.close();
    if (hasOpenedRef.current) clearListUrl();
  }, [open]);

  function closeDialog() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    else onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="deal-dialog shopping-list-dialog"
      aria-labelledby={titleId}
      onClose={() => {
        if (open) onClose();
      }}
      onMouseDown={(event) => {
        const dialog = event.currentTarget;
        const rect = dialog.getBoundingClientRect();
        const inside =
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom;
        if (!inside) dialog.close();
      }}
    >
      {open ? (
        <ShoppingListContent
          products={products}
          referenceNow={referenceNow}
          initialTab={initialTab}
          initialShop={initialShop}
          titleId={titleId}
          onClose={closeDialog}
        />
      ) : null}
    </dialog>
  );
}
