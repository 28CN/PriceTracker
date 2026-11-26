'use client';

import { BadgeDollarSign, ChevronDown, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';

import InfoTip from '@/components/InfoTip';
import ProductVisual from '@/components/ProductVisual';
import { formatLastSeen, formatMoney } from '@/lib/format';
import type { OverviewEntry, OverviewResponse } from '@/lib/overview';
import { productThumb } from '@/lib/productImage';
import { retailerKey } from '@/lib/retailer';
import type { ProductView } from '@/lib/types';

type OverviewStatus = 'loading' | 'ready' | 'error';

function EntryList({
  title,
  icon,
  tone,
  entries,
  productMap,
  onNavigate,
  headingTag: Heading = 'h3'
}: {
  title: string;
  icon: React.ReactNode;
  tone: 'drop' | 'goal' | 'rise';
  entries: (OverviewEntry & { at?: string })[];
  productMap: Map<string, ProductView>;
  onNavigate?: (productId: string) => void;
  headingTag?: 'h2' | 'h3';
}) {
  if (entries.length === 0) return null;

  return (
    <div className={`tw-group tw-group-${tone}`}>
      <Heading className="tw-group-title">
        {icon}
        <span>{title}</span>
      </Heading>
      <ul className="tw-list">
        {entries.map((entry) => {
          const prod = productMap.get(entry.productId);
          const link = prod?.links.find((l) => l.id === entry.linkId);
          const thumb = prod ? productThumb(prod, entry.linkId) : null;
          const shopSlug = retailerKey(link?.url || entry.retailer);

          return (
            <li key={`${entry.productId}-${entry.linkId}`}>
              <a
                href={`#p-${entry.productId}`}
                className="tw-row"
                data-shop={shopSlug ?? undefined}
                onClick={() => onNavigate?.(entry.productId)}
              >
                <span className="tw-thumb">
                  <ProductVisual
                    source={thumb}
                    name={entry.name}
                    category={prod?.categoryName}
                    shop={entry.retailer}
                    shopUrl={link?.url}
                  />
                </span>
                <span className="tw-copy">
                  <span className="tw-name">{entry.name}</span>
                  <span className="tw-shop">
                    <span className="shop-dot" aria-hidden="true" />
                    <span>{entry.retailer}</span>
                    {entry.at && formatLastSeen(entry.at) ? (
                      <span className="tw-when">
                        · from <time dateTime={entry.at}>{formatLastSeen(entry.at)}</time>
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="tw-prices">
                  <span className="tw-old">{formatMoney(entry.oldPrice)}</span>
                  <span className="tw-arrow" aria-hidden="true">→</span>
                  <strong className="tw-new">{formatMoney(entry.newPrice)}</strong>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function ThisWeekPanel({
  overview,
  status,
  products,
  collapsible = false,
  onNavigateProduct
}: {
  overview: OverviewResponse | null;
  status: OverviewStatus;
  products: ProductView[];
  collapsible?: boolean;
  onNavigateProduct?: (productId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  const totalItems = overview
    ? overview.biggestDrops.length +
      overview.newlyBelowGoal.length +
      overview.usualPriceRises.length
    : 0;

  const body = (
    <div className="tw-body">
      {status === 'loading' ? (
        <div className="tw-skel-stack" aria-busy="true" aria-label="Loading this week">
          <span className="tw-skel-row" />
          <span className="tw-skel-row" />
          <span className="tw-skel-row" />
        </div>
      ) : totalItems === 0 ? (
        <p className="tw-empty">Nothing changed this week</p>
      ) : overview ? (
        <div className="tw-groups">
          <EntryList
            title="Biggest drops"
            icon={<TrendingDown size={16} aria-hidden="true" />}
            tone="drop"
            entries={overview.biggestDrops}
            productMap={productMap}
            onNavigate={onNavigateProduct}
            headingTag={collapsible ? 'h2' : 'h3'}
          />
          <EntryList
            title="Newly below goal"
            icon={<BadgeDollarSign size={16} aria-hidden="true" />}
            tone="goal"
            entries={overview.newlyBelowGoal}
            productMap={productMap}
            onNavigate={onNavigateProduct}
            headingTag={collapsible ? 'h2' : 'h3'}
          />
          <EntryList
            title="Usual price went up"
            icon={<TrendingUp size={16} aria-hidden="true" />}
            tone="rise"
            entries={overview.usualPriceRises}
            productMap={productMap}
            onNavigate={onNavigateProduct}
            headingTag={collapsible ? 'h2' : 'h3'}
          />
        </div>
      ) : null}
    </div>
  );

  if (collapsible) {
    return (
      <section className="this-week-panel is-collapsible" aria-label="This week">
        <button
          type="button"
          className="tw-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="tw-toggle-left">
            <ChevronDown
              size={16}
              className={`tw-chevron${open ? ' is-open' : ''}`}
              aria-hidden="true"
            />
            <span className="tw-heading">This week</span>
            {status === 'ready' && totalItems > 0 ? (
              <span className="tw-count">{totalItems}</span>
            ) : null}
          </span>
        </button>
        {open ? body : null}
      </section>
    );
  }

  return (
    <aside className="this-week-panel" aria-labelledby="this-week-heading">
      <header className="tw-head">
        <h2 id="this-week-heading" className="tw-heading">
          This week
        </h2>
        <InfoTip label="About This week">
          Changes compared with last week across your tracked shops.
        </InfoTip>
      </header>
      {body}
    </aside>
  );
}
