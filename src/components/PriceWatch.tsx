import { ChevronDown, Clock, PackageCheck, Tag, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import ProductVisual from '@/components/ProductVisual';
import RetailerLogo from '@/components/RetailerLogo';
import { formatMoney } from '@/lib/format';
import { productThumb } from '@/lib/productImage';
import type { ProductView } from '@/lib/types';
import type { SaleCycle, WatchItem } from '@/lib/watch';
import type { WatchView } from '@/lib/watchData';

const perthShortDateFormatter = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Australia/Perth'
});

function formatShortDate(iso: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`) : new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return perthShortDateFormatter.format(date);
}

function formatPrice(value: number | null): string {
  return value === null ? '—' : formatMoney(value);
}

function formatSavingPct(saving: number): string {
  return `−${Math.round(Math.abs(saving) * 100)}%`;
}

function formatMovePct(pct: number): string {
  const amount = Math.round(Math.abs(pct) * 100);
  return pct < 0 ? `−${amount}%` : `+${amount}%`;
}

function CycleMeta({ cycle }: { cycle: SaleCycle }) {
  const depth = cycle.depth >= 0.45 ? 'half price' : `−${Math.round(cycle.depth * 100)}%`;
  const cadence =
    cycle.everyDays < 14
      ? `~${cycle.everyDays} ${cycle.everyDays === 1 ? 'day' : 'days'}`
      : (() => {
          const weeks = Math.round(cycle.everyDays / 7);
          return `~${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
        })();
  const nextLabel = formatShortDate(cycle.next);

  return (
    <>
      Usually {depth} every {cadence}
      {nextLabel ? (
        <>
          {' · next ~'}
          <time dateTime={cycle.next}>{nextLabel}</time>
        </>
      ) : null}
    </>
  );
}

function WatchRow({
  item,
  product,
  shopOverride,
  tags,
  meta,
  badge
}: {
  item: WatchItem;
  product?: ProductView;
  shopOverride?: string | null;
  tags?: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
}) {
  const shopName = item.shop ?? shopOverride ?? null;

  return (
    <li className="watch-row">
      <div className="watch-thumb" aria-hidden="true">
        <ProductVisual
          source={product ? productThumb(product) : null}
          name={product?.name ?? item.name}
          category={product?.categoryName}
        />
      </div>

      <div className="watch-row-main">
        <Link className="watch-item-name" href={`/#p-${item.id}`}>
          {item.name}
        </Link>

        <div className="watch-meta">
          {shopName ? (
            <span className="watch-shop">
              <RetailerLogo retailer={shopName} url={item.url} />
              <span className="watch-shop-name">{shopName}</span>
            </span>
          ) : null}
          {tags}
          {shopName && !tags && meta ? (
            <span className="watch-meta-sep" aria-hidden="true">
              ·
            </span>
          ) : null}
          {meta ? <span className="watch-meta-text">{meta}</span> : null}
        </div>
      </div>

      <div className="watch-row-end">
        <span className="watch-price">{formatPrice(item.price)}</span>
        {badge}
      </div>
    </li>
  );
}

function WatchSection({
  id,
  title,
  count,
  icon,
  tone,
  children
}: {
  id: string;
  title: string;
  count: number;
  icon: ReactNode;
  tone: 'success' | 'brand' | 'danger' | 'info' | 'warn';
  children: ReactNode;
}) {
  const headingId = `watch-heading-${id}`;
  return (
    <section className="watch-section glass-surface" id={id} aria-labelledby={headingId}>
      <header className="watch-section-head">
        <h2 id={headingId} className="watch-section-title">
          <span className={`watch-section-icon is-${tone}`} aria-hidden="true">
            {icon}
          </span>
          <span>{title}</span>
        </h2>
        <span className="watch-count">{count}</span>
      </header>
      <ul className="watch-list">{children}</ul>
    </section>
  );
}

export default function PriceWatch({ view }: { view: WatchView }) {
  const { products, items, sections } = view;
  const productsById = new Map(products.map((product) => [product.id, product]));

  const chips = [
    {
      id: 'buy',
      label: 'Buy now',
      count: sections.buyNow.length,
      icon: <Tag size={14} aria-hidden="true" />,
      tone: 'success' as const
    },
    {
      id: 'wait',
      label: 'Wait for sale',
      count: sections.wait.length,
      icon: <Clock size={14} aria-hidden="true" />,
      tone: 'brand' as const
    },
    {
      id: 'down',
      label: 'Down',
      count: sections.down.length,
      icon: <TrendingDown size={14} aria-hidden="true" />,
      tone: 'success' as const
    },
    {
      id: 'up',
      label: 'Up',
      count: sections.up.length,
      icon: <TrendingUp size={14} aria-hidden="true" />,
      tone: 'danger' as const
    },
    {
      id: 'back',
      label: 'Back in stock',
      count: sections.backInStock.length,
      icon: <PackageCheck size={14} aria-hidden="true" />,
      tone: 'info' as const
    },
    {
      id: 'fake',
      label: 'Not a real sale',
      count: sections.notReal.length,
      icon: <TriangleAlert size={14} aria-hidden="true" />,
      tone: 'warn' as const
    }
  ].filter((chip) => chip.count > 0);

  const hasMoves = sections.down.length > 0 || sections.up.length > 0;
  const hasBothMoves = sections.down.length > 0 && sections.up.length > 0;

  return (
    <div className="watch-body">
      {chips.length > 0 ? (
        <nav className="watch-chips" aria-label="Jump to section">
          {chips.map((chip) => (
            <a key={chip.id} href={`#${chip.id}`} className={`watch-chip is-${chip.tone}`}>
              <span className="watch-chip-icon" aria-hidden="true">
                {chip.icon}
              </span>
              <span>{chip.label}</span>
              <span className="watch-chip-count">{chip.count}</span>
            </a>
          ))}
        </nav>
      ) : null}

      {chips.length === 0 ? (
        <section className="watch-empty glass-surface">
          <p>Nothing to act on this week.</p>
        </section>
      ) : (
        <>
          {sections.buyNow.length > 0 ? (
            <WatchSection
              id="buy"
              title="Buy now"
              count={sections.buyNow.length}
              icon={<Tag size={16} />}
              tone="success"
            >
              {sections.buyNow.map((item) => {
                const isRealSale = item.verdict === 'real_discount';
                return (
                  <WatchRow
                    key={item.id}
                    item={item}
                    product={productsById.get(item.id)}
                    tags={
                      <>
                        {isRealSale ? <span className="watch-tag is-success">Real sale</span> : null}
                        {item.isLow ? <span className="watch-tag is-brand">Lowest ever</span> : null}
                      </>
                    }
                    meta={isRealSale && item.usual !== null ? `usual ${formatMoney(item.usual)}` : null}
                    badge={
                      isRealSale && item.saving !== null && item.saving > 0 ? (
                        <span className="watch-pct is-down">{formatSavingPct(item.saving)}</span>
                      ) : null
                    }
                  />
                );
              })}
            </WatchSection>
          ) : null}

          {sections.wait.length > 0 ? (
            <WatchSection
              id="wait"
              title="Wait for sale"
              count={sections.wait.length}
              icon={<Clock size={16} />}
              tone="brand"
            >
              {sections.wait.map((item) => (
                <WatchRow
                  key={item.id}
                  item={item}
                  product={productsById.get(item.id)}
                  meta={item.cycle ? <CycleMeta cycle={item.cycle} /> : null}
                />
              ))}
            </WatchSection>
          ) : null}

          {hasMoves ? (
            <div className={`watch-moves${hasBothMoves ? ' has-both' : ''}`}>
              {sections.down.length > 0 ? (
                <WatchSection
                  id="down"
                  title="Down this week"
                  count={sections.down.length}
                  icon={<TrendingDown size={16} />}
                  tone="success"
                >
                  {sections.down.map((item) => (
                    <WatchRow
                      key={item.id}
                      item={item}
                      product={productsById.get(item.id)}
                      meta={item.week ? `${formatMoney(item.week.from)} → ${formatMoney(item.week.to)}` : null}
                      badge={
                        item.week ? <span className="watch-pct is-down">{formatMovePct(item.week.pct)}</span> : null
                      }
                    />
                  ))}
                </WatchSection>
              ) : null}

              {sections.up.length > 0 ? (
                <WatchSection
                  id="up"
                  title="Up this week"
                  count={sections.up.length}
                  icon={<TrendingUp size={16} />}
                  tone="danger"
                >
                  {sections.up.map((item) => (
                    <WatchRow
                      key={item.id}
                      item={item}
                      product={productsById.get(item.id)}
                      meta={item.week ? `${formatMoney(item.week.from)} → ${formatMoney(item.week.to)}` : null}
                      badge={item.week ? <span className="watch-pct is-up">{formatMovePct(item.week.pct)}</span> : null}
                    />
                  ))}
                </WatchSection>
              ) : null}
            </div>
          ) : null}

          {sections.backInStock.length > 0 ? (
            <WatchSection
              id="back"
              title="Back in stock"
              count={sections.backInStock.length}
              icon={<PackageCheck size={16} />}
              tone="info"
            >
              {sections.backInStock.map((item) => {
                const restockedShop = item.backInStock?.shop ?? item.shop;
                return (
                  <WatchRow
                    key={item.id}
                    item={item}
                    product={productsById.get(item.id)}
                    shopOverride={restockedShop}
                    meta={restockedShop ? `${restockedShop} has it again` : 'Back in stock'}
                  />
                );
              })}
            </WatchSection>
          ) : null}

          {sections.notReal.length > 0 ? (
            <WatchSection
              id="fake"
              title="Not a real sale"
              count={sections.notReal.length}
              icon={<TriangleAlert size={16} />}
              tone="warn"
            >
              {sections.notReal.map((item) => (
                <WatchRow
                  key={item.id}
                  item={item}
                  product={productsById.get(item.id)}
                  meta={
                    item.raise ? `Raised to ${formatMoney(item.raise.to)} before the drop` : 'Raised before the drop'
                  }
                />
              ))}
            </WatchSection>
          ) : null}
        </>
      )}

      <details className="watch-all glass-surface">
        <summary className="watch-all-summary">
          <span>All items ({items.length})</span>
          <ChevronDown className="watch-all-chevron" size={16} aria-hidden="true" />
        </summary>

        {items.length === 0 ? (
          <p className="watch-all-empty">No tracked items yet.</p>
        ) : (
          <div className="watch-all-content">
            <div className="watch-all-table-wrap">
              <table className="watch-all-table" aria-label="All tracked items">
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col" className="is-num">
                      Now
                    </th>
                    <th scope="col" className="is-num">
                      Usual
                    </th>
                    <th scope="col" className="is-num">
                      Lowest ever
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const product = productsById.get(item.id);
                    const lowDate = item.allTimeLow ? formatShortDate(item.allTimeLow.at) : '';
                    return (
                      <tr key={item.id}>
                        <th scope="row">
                          <div className="watch-table-item">
                            <div className="watch-thumb" aria-hidden="true">
                              <ProductVisual
                                source={product ? productThumb(product) : null}
                                name={product?.name ?? item.name}
                                category={product?.categoryName}
                              />
                            </div>
                            <div className="watch-table-item-text">
                              <Link className="watch-item-name" href={`/#p-${item.id}`}>
                                {item.name}
                              </Link>
                              {item.shop ? (
                                <span className="watch-shop">
                                  <RetailerLogo retailer={item.shop} url={item.url} />
                                  <span className="watch-shop-name">{item.shop}</span>
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </th>
                        <td className="is-num">{formatPrice(item.price)}</td>
                        <td className="is-num is-muted">{formatPrice(item.usual)}</td>
                        <td className="is-num">
                          {item.allTimeLow ? (
                            <span className="watch-low-cell">
                              <span>{formatMoney(item.allTimeLow.price)}</span>
                              {lowDate ? (
                                <time className="watch-low-date" dateTime={item.allTimeLow.at}>
                                  {lowDate}
                                </time>
                              ) : null}
                            </span>
                          ) : (
                            <span className="is-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ul className="watch-all-list">
              {items.map((item) => {
                const product = productsById.get(item.id);
                const lowDate = item.allTimeLow ? formatShortDate(item.allTimeLow.at) : '';
                return (
                  <li key={item.id} className="watch-all-row">
                    <div className="watch-thumb" aria-hidden="true">
                      <ProductVisual
                        source={product ? productThumb(product) : null}
                        name={product?.name ?? item.name}
                        category={product?.categoryName}
                      />
                    </div>
                    <div className="watch-all-row-main">
                      <div className="watch-all-row-top">
                        <Link className="watch-item-name" href={`/#p-${item.id}`}>
                          {item.name}
                        </Link>
                        <span className="watch-price">{formatPrice(item.price)}</span>
                      </div>
                      <div className="watch-all-row-meta">
                        <span>Usual {formatPrice(item.usual)}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Lowest{' '}
                          {item.allTimeLow ? (
                            <>
                              {formatMoney(item.allTimeLow.price)}
                              {lowDate ? (
                                <>
                                  {' '}
                                  (<time dateTime={item.allTimeLow.at}>{lowDate}</time>)
                                </>
                              ) : null}
                            </>
                          ) : (
                            '—'
                          )}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </details>
    </div>
  );
}
