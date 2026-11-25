import type { Metadata } from 'next';
import Link from 'next/link';

import InfoTip from '@/components/InfoTip';
import RetailerLogo from '@/components/RetailerLogo';
import { requireViewer } from '@/lib/auth';
import { BASKET_SHOPS, summariseBasket, type BasketRow, type BasketShopKey, type ShopCell } from '@/lib/basket';
import { formatLastSeen, formatMoney } from '@/lib/format';
import { fetchProducts } from '@/lib/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ProductView } from '@/lib/types';
import { formatUnitPrice, unitPriceFor } from '@/lib/unitPrice';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export const metadata: Metadata = {
  title: 'Compare shops · PriceTracker',
  robots: { index: false, follow: false }
};

const SHOP_URL: Record<BasketShopKey, string> = {
  coles: 'https://www.coles.com.au',
  woolworths: 'https://www.woolworths.com.au'
};

const shopName = (key: BasketShopKey) => BASKET_SHOPS.find((shop) => shop.key === key)?.name ?? key;

function PriceCell({ cell, row, shop }: { cell: ShopCell; row: BasketRow; shop: BasketShopKey }) {
  if (cell.kind === 'not_tracked') {
    return <td className="compare-cell is-missing">Not tracked</td>;
  }
  if (cell.kind === 'unavailable') {
    return <td className="compare-cell is-missing">Out of stock</td>;
  }
  if (cell.kind === 'no_price') {
    return <td className="compare-cell is-missing">No price yet</td>;
  }
  if (cell.kind === 'stale') {
    const seen = formatLastSeen(cell.at);
    return (
      <td className="compare-cell is-stale">
        <span className="compare-price">{formatMoney(cell.price)}</span>
        {seen && cell.at ? (
          <small>
            Last seen <time dateTime={cell.at}>{seen}</time>
          </small>
        ) : null}
      </td>
    );
  }

  // Only mark a winner when both shops have a fresh price and they differ.
  const other = row.cells[shop === 'coles' ? 'woolworths' : 'coles'];
  const cheapest = row.inBasket && other.kind === 'fresh' && cell.price < other.price;
  const unit = unitPriceFor(row.product.name, cell.price);
  return (
    <td className={`compare-cell${cheapest ? ' is-cheapest' : ''}`}>
      <span className="compare-price">
        {formatMoney(cell.price)}
        {cheapest ? <span className="sr-only"> (cheaper)</span> : null}
      </span>
      {unit ? <small>{formatUnitPrice(unit)}</small> : null}
    </td>
  );
}

function Rows({ rows }: { rows: BasketRow[] }) {
  return (
    <>
      {rows.map((row) => (
        <tr key={row.product.id}>
          <th scope="row">
            <Link href={`/#p-${row.product.id}`}>{row.product.name}</Link>
          </th>
          {BASKET_SHOPS.map(({ key }) => (
            <PriceCell key={key} cell={row.cells[key]} row={row} shop={key} />
          ))}
        </tr>
      ))}
    </>
  );
}

export default async function ComparePage() {
  const viewer = await requireViewer('/compare');
  const supabase = await createServerSupabaseClient();
  let products: ProductView[] = [];
  let loadError: string | null = null;
  try {
    products = await fetchProducts(supabase, viewer.id);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Failed to load data.';
  }

  const basket = summariseBasket(products);
  const compared = basket.rows.filter((row) => row.inBasket);
  const leftOut = basket.rows.filter((row) => !row.inBasket);
  const bestSingle = basket.cheaperShop;
  const tiles: { key: string; label: string; total: number; logo?: BasketShopKey; best: boolean }[] = [
    { key: 'coles', label: 'Coles', total: basket.totals.coles, logo: 'coles', best: bestSingle === 'coles' && basket.splitSaving === 0 },
    {
      key: 'woolworths',
      label: 'Woolworths',
      total: basket.totals.woolworths,
      logo: 'woolworths',
      best: bestSingle === 'woolworths' && basket.splitSaving === 0
    },
    { key: 'split', label: 'Best of both', total: basket.totals.split, best: basket.splitSaving > 0 }
  ];

  return (
    <main className="compare-page">
      <section className="manage-hero compare-hero">
        <h1>
          Compare shops
          <InfoTip label="About this comparison">
            Your list at Coles and Woolworths. Only prices checked in the last week count. “Best of both” buys each
            item where it is cheaper.
          </InfoTip>
        </h1>
      </section>

      {loadError ? <div className="alert">{loadError}</div> : null}

      {basket.rows.length === 0 ? (
        <section className="compare-empty glass-surface">
          <p>Nothing on your list is tracked at Coles or Woolworths yet.</p>
          <Link className="button primary" href="/add">
            Add a product
          </Link>
        </section>
      ) : (
        <>
          <section className="compare-summary glass-surface" aria-label="Basket totals">
            {basket.comparedCount > 0 ? (
              <>
                <ul className="compare-tiles">
                  {tiles.map((tile) => (
                    <li key={tile.key} className={tile.best ? 'is-best' : undefined}>
                      <span className="compare-tile-label">
                        {tile.logo ? <RetailerLogo retailer={tile.label} url={SHOP_URL[tile.logo]} /> : null}
                        {tile.label}
                      </span>
                      <b>{formatMoney(tile.total)}</b>
                    </li>
                  ))}
                </ul>
                <p className="compare-verdict">
                  {basket.splitSaving > 0 && bestSingle ? (
                    <>
                      Buying each item where it is cheaper saves <b>{formatMoney(basket.splitSaving)}</b> on{' '}
                      {shopName(bestSingle)} alone.
                    </>
                  ) : bestSingle ? (
                    <>
                      {shopName(bestSingle)} is cheaper for everything here, by <b>{formatMoney(basket.shopGap)}</b>.
                    </>
                  ) : (
                    <>Both shops cost the same for these items.</>
                  )}
                </p>
                <p className="compare-scope">
                  {basket.comparedCount} {basket.comparedCount === 1 ? 'item' : 'items'} with a fresh price at both shops.
                  {leftOut.length > 0 ? (
                    <>
                      {' '}
                      {leftOut.length} left out
                      <InfoTip label="Why items are left out">
                        Left out when one shop does not have it, it is out of stock, or the price is more than a week
                        old.
                      </InfoTip>
                    </>
                  ) : null}
                </p>
              </>
            ) : (
              <p className="compare-scope">
                No item has a fresh price at both shops yet, so there is no total to compare.
              </p>
            )}
          </section>

          <section className="compare-table-wrap glass-surface" aria-label="Prices by item">
            <table className="compare-table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  {BASKET_SHOPS.map(({ key, name }) => (
                    <th scope="col" key={key}>
                      <span className="compare-shop-head">
                        <RetailerLogo retailer={name} url={SHOP_URL[key]} />
                        {name}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Rows rows={compared} />
              </tbody>
              {leftOut.length > 0 ? (
                <tbody className="compare-left-out">
                  <tr>
                    <th scope="rowgroup" colSpan={3}>
                      Not in the totals
                    </th>
                  </tr>
                  <Rows rows={leftOut} />
                </tbody>
              ) : null}
            </table>
          </section>
        </>
      )}
    </main>
  );
}
