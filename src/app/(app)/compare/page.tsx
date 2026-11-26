import type { Metadata } from "next";
import Link from "next/link";

import InfoTip from "@/components/InfoTip";
import ProductVisual from "@/components/ProductVisual";
import RetailerLogo from "@/components/RetailerLogo";
import { requireViewer } from "@/lib/auth";
import {
  groupsWithItems,
  pickGroup,
  summariseGroup,
  type GroupRow,
  type GroupShop,
  type GroupSummary,
  type ShopCell,
} from "@/lib/basket";
import { formatLastSeen, formatMoney } from "@/lib/format";
import { productThumb } from "@/lib/productImage";
import { fetchProducts } from "@/lib/queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ProductView } from "@/lib/types";
import { formatUnitPrice, unitPriceFor } from "@/lib/unitPrice";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "Compare shops · PriceTracker",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ group?: string | string[] }>;

function ShopLogo({ shop }: { shop: GroupShop }) {
  return <RetailerLogo retailer={shop.name} url={shop.url} />;
}

function PriceCell({ cell, row, shop }: { cell: ShopCell; row: GroupRow; shop: string }) {
  if (cell.kind === "not_tracked") {
    return (
      <td className="compare-cell is-missing">
        <span aria-hidden="true">–</span>
        <span className="sr-only">Not tracked</span>
      </td>
    );
  }
  if (cell.kind === "unavailable") {
    return <td className="compare-cell is-missing">Out of stock</td>;
  }
  if (cell.kind === "no_price") {
    return <td className="compare-cell is-missing">No price yet</td>;
  }
  if (cell.kind === "stale") {
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

  const cheapest = row.cheapest?.shop === shop;
  const unit = unitPriceFor(row.product.name, cell.price);
  return (
    <td className={`compare-cell${cheapest ? " is-cheapest" : ""}`}>
      <span className="compare-price">
        {formatMoney(cell.price)}
        {cheapest ? <span className="sr-only"> (cheapest)</span> : null}
      </span>
      {unit ? <small>{formatUnitPrice(unit)}</small> : null}
    </td>
  );
}

function ItemName({ product }: { product: ProductView }) {
  return (
    <Link className="compare-item" href={`/#p-${product.id}`}>
      <ProductVisual source={productThumb(product)} name={product.name} category={product.categoryName} />
      <span>{product.name}</span>
    </Link>
  );
}

function Rows({ rows, shops }: { rows: GroupRow[]; shops: GroupShop[] }) {
  return (
    <>
      {rows.map((row) => (
        <tr key={row.product.id}>
          <th scope="row">
            <ItemName product={row.product} />
          </th>
          {shops.map(({ key }) => (
            <PriceCell key={key} cell={row.cells[key]} row={row} shop={key} />
          ))}
        </tr>
      ))}
    </>
  );
}

function Verdict({ summary }: { summary: GroupSummary }) {
  const best = summary.shops.find((entry) => entry.key === summary.best);
  if (summary.comparedCount === 0) {
    return <p className="compare-verdict">Not enough fresh prices at two shops to compare yet.</p>;
  }
  if (!best) {
    return <p className="compare-verdict">No clear winner: same prices so far.</p>;
  }
  const saving = summary.elsewhere.reduce((sum, entry) => sum + Math.round((entry.saving ?? 0) * 100), 0) / 100;
  return (
    <p className="compare-verdict">
      <span className="compare-verdict-shop">
        <ShopLogo shop={best} />
        <b>{best.name}</b>
      </span>{" "}
      is usually cheapest for your list.
      {summary.elsewhere.length > 0 ? (
        <>
          {" "}
          {saving > 0 ? (
            <>
              Buy {summary.elsewhere.length} {summary.elsewhere.length === 1 ? "item" : "items"} elsewhere to save{" "}
              <b>{formatMoney(saving)}</b>.
            </>
          ) : (
            <>
              {summary.elsewhere.length} {summary.elsewhere.length === 1 ? "item is" : "items are"} cheaper elsewhere.
            </>
          )}
        </>
      ) : null}
    </p>
  );
}

export default async function ComparePage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer("/compare");
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  let products: ProductView[] = [];
  let loadError: string | null = null;
  try {
    products = await fetchProducts(supabase, viewer.id);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Failed to load data.";
  }

  const available = groupsWithItems(products);
  const requested = Array.isArray(params.group) ? params.group[0] : params.group;
  const group = pickGroup(available, requested);
  const summary = summariseGroup(products, group);
  const compared = summary.rows.filter((row) => row.compared);
  const leftOut = summary.rows.filter((row) => !row.compared);
  const shopByKey = new Map(group.shops.map((entry) => [entry.key, entry]));

  return (
    <main className="compare-page">
      <h1 className="compare-title">
        Compare shops
        <InfoTip label="About this comparison">
          Shops are compared only with their rivals. Prices from the last week count. Each shop shows how often it is
          cheapest, and how much more it costs than the cheapest on the items it sells.
        </InfoTip>
      </h1>

      {loadError ? <div className="alert">{loadError}</div> : null}

      {available.length === 0 ? (
        <section className="compare-empty glass-surface">
          <p>Track an item at two rival shops (like Coles and Woolworths, or Kmart and Big W) to compare them.</p>
          <Link className="button primary" href="/add">
            Add a product
          </Link>
        </section>
      ) : (
        <>
          <nav className="compare-groups" aria-label="Shop group">
            {available.map(({ group: entry, count }) => (
              <Link
                key={entry.key}
                href={`/compare?group=${entry.key}`}
                className={`compare-group${entry.key === group.key ? " is-active" : ""}`}
                aria-current={entry.key === group.key ? "page" : undefined}
              >
                <span className="compare-group-logos" aria-hidden="true">
                  {entry.shops.map((shop) => (
                    <ShopLogo key={shop.key} shop={shop} />
                  ))}
                </span>
                {entry.name}
                <span className="compare-group-count">{count}</span>
              </Link>
            ))}
          </nav>

          <section className="compare-summary glass-surface" aria-label={`${group.name}: which shop is cheaper`}>
            {summary.shops.length >= 2 ? (
              <ul className={`compare-tiles is-${summary.standings.length}`}>
                {summary.standings.map((standing) => (
                  <li key={standing.key} className={standing.key === summary.best ? "is-best" : undefined}>
                    <span className="compare-tile-label">
                      <ShopLogo shop={standing} />
                      {standing.name}
                    </span>
                    <b>
                      {standing.wins}
                      <span className="compare-tile-of">/{summary.comparedCount}</span>
                    </b>
                    <small>
                      cheapest
                      {standing.extra > 0 ? <span className="compare-tile-extra">+{formatMoney(standing.extra)}</span> : null}
                    </small>
                  </li>
                ))}
              </ul>
            ) : null}
            {summary.shops.length >= 2 ? (
              <Verdict summary={summary} />
            ) : (
              <p className="compare-verdict">Only one {group.name.toLowerCase()} shop is tracked so far.</p>
            )}
            {summary.missingShops.length > 0 ? (
              <p className="compare-scope">
                Nothing tracked at {summary.missingShops.map((entry) => entry.name).join(" or ")}.
              </p>
            ) : null}
          </section>

          {summary.elsewhere.length > 0 ? (
            <section className="compare-elsewhere glass-surface" aria-labelledby="compare-elsewhere-title">
              <h2 id="compare-elsewhere-title">Cheaper elsewhere</h2>
              <ul>
                {summary.elsewhere.map((entry) => {
                  const shop = shopByKey.get(entry.shop);
                  return (
                    <li key={entry.row.product.id}>
                      <ItemName product={entry.row.product} />
                      <span className="compare-elsewhere-shop">
                        {shop ? <ShopLogo shop={shop} /> : null}
                        <span className="compare-elsewhere-name">{shop?.name}</span>
                        <b>{formatMoney(entry.price)}</b>
                      </span>
                      {entry.saving ? (
                        <span className="compare-save">Save {formatMoney(entry.saving)}</span>
                      ) : (
                        <span className="compare-save is-only">
                          Not at {shopByKey.get(summary.best ?? "")?.name}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section className="compare-table-wrap glass-surface" aria-label="Prices by item">
            <table className={`compare-table has-${summary.shops.length}`}>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  {summary.shops.map((shop) => (
                    <th scope="col" key={shop.key}>
                      <span className="compare-shop-head">
                        <ShopLogo shop={shop} />
                        <span className="compare-shop-name">{shop.name}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Rows rows={compared} shops={summary.shops} />
              </tbody>
              {leftOut.length > 0 ? (
                <tbody className="compare-left-out">
                  <tr>
                    <th scope="rowgroup" colSpan={summary.shops.length + 1}>
                      <span className="compare-left-out-note">
                        Not compared
                        <InfoTip label="Why items are not compared">
                          Needs a fresh, in-stock price at two of these shops.
                        </InfoTip>
                      </span>
                    </th>
                  </tr>
                  <Rows rows={leftOut} shops={summary.shops} />
                </tbody>
              ) : null}
            </table>
          </section>
        </>
      )}
    </main>
  );
}
