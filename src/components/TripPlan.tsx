import Link from "next/link";

import ProductVisual from "@/components/ProductVisual";
import RetailerLogo from "@/components/RetailerLogo";
import {
  newestStaleOffer,
  type GroupRow,
  type GroupSummary,
  type TripPlan as TripPlanData,
  type TripSingleShop,
} from "@/lib/basket";
import { formatLastSeen, formatMoney } from "@/lib/format";
import { productThumb } from "@/lib/productImage";

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function SingleShopLine({ singleShop }: { singleShop: TripSingleShop }) {
  const { shop, extra, missing } = singleShop;
  return (
    <p className="trip-single">
      <span className="trip-single-shop">
        <RetailerLogo retailer={shop.name} url={shop.url} />
        <span>All at {shop.name}:</span>
      </span>{" "}
      {extra > 0 ? (
        <>
          <b>{formatMoney(extra)} more</b>
          {missing > 0 ? <>, {countLabel(missing, "item", "items")} not there</> : null}
        </>
      ) : missing > 0 ? (
        <>same price, {countLabel(missing, "item", "items")} not there</>
      ) : (
        <>already cheapest</>
      )}
    </p>
  );
}

function UnpricedState({ row, summary }: { row: GroupRow; summary: GroupSummary }) {
  const stale = newestStaleOffer(row, summary.group.shops);
  if (stale) {
    const seen = formatLastSeen(stale.at);
    return (
      <span className="trip-unpriced-state">
        <span className="trip-unpriced-price">{formatMoney(stale.price)}</span>
        <small className="trip-unpriced-meta">
          {stale.shop.name}
          {seen && stale.at ? (
            <>
              {" · Last seen "}
              <time dateTime={stale.at}>{seen}</time>
            </>
          ) : null}
        </small>
      </span>
    );
  }

  const outOfStock = summary.group.shops.some(({ key }) => row.cells[key]?.kind === "unavailable");
  return (
    <span className="trip-unpriced-state">
      <small className="trip-unpriced-meta">{outOfStock ? "Out of stock" : "No price yet"}</small>
    </span>
  );
}

export default function TripPlan({
  summary,
  plan,
}: {
  summary: GroupSummary;
  plan: TripPlanData;
}) {
  const smallByShop = new Map(plan.smallStops.map((stop) => [stop.shop.key, stop]));
  const totalItems = plan.stops.reduce((sum, stop) => sum + stop.items.length, 0);
  const stopCols = Math.min(plan.stops.length, 3);

  return (
    <div className="trip-plan">
      {plan.stops.length > 0 ? (
        <>
          <section className="trip-overview glass-surface" aria-label="Trip total">
            <p className="trip-total-line">
              <span className="trip-total-label">Total</span>
              <b className="trip-total-amount">{formatMoney(plan.total)}</b>
              <span className="trip-total-meta">
                {countLabel(totalItems, "item", "items")} · {countLabel(plan.stops.length, "shop", "shops")}
              </span>
            </p>
            {plan.singleShop ? <SingleShopLine singleShop={plan.singleShop} /> : null}
          </section>

          <div className={`trip-stops is-${stopCols}`}>
            {plan.stops.map((stop) => {
              const small = smallByShop.get(stop.shop.key);
              return (
                <article key={stop.shop.key} className="trip-stop glass-surface">
                  <header className="trip-stop-head">
                    <div className="trip-stop-shop">
                      <RetailerLogo retailer={stop.shop.name} url={stop.shop.url} />
                      <div className="trip-stop-title">
                        <h2>{stop.shop.name}</h2>
                        <span className="trip-stop-count">{countLabel(stop.items.length, "item", "items")}</span>
                      </div>
                    </div>
                    <span className="trip-stop-subtotal">{formatMoney(stop.subtotal)}</span>
                  </header>

                  {small ? (
                    <p className="trip-stop-hint">Saves {formatMoney(small.saving)}. Skip?</p>
                  ) : null}

                  <ul className="trip-items">
                    {stop.items.map((item) => (
                      <li key={item.row.product.id} className="trip-item">
                        <Link className="compare-item" href={`/#p-${item.row.product.id}`}>
                          <ProductVisual
                            source={productThumb(item.row.product)}
                            name={item.row.product.name}
                            category={item.row.product.categoryName}
                          />
                          <span>{item.row.product.name}</span>
                        </Link>
                        <span className="trip-item-price">{formatMoney(item.price)}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <section className="trip-empty glass-surface">
          <p>No fresh prices in this group yet.</p>
        </section>
      )}

      {plan.unpriced.length > 0 ? (
        <section className="trip-unpriced glass-surface" aria-labelledby="trip-unpriced-title">
          <h2 id="trip-unpriced-title">Unpriced</h2>
          <ul className="trip-unpriced-list">
            {plan.unpriced.map((row) => (
              <li key={row.product.id} className="trip-unpriced-row">
                <Link className="compare-item" href={`/#p-${row.product.id}`}>
                  <ProductVisual
                    source={productThumb(row.product)}
                    name={row.product.name}
                    category={row.product.categoryName}
                  />
                  <span>{row.product.name}</span>
                </Link>
                <UnpricedState row={row} summary={summary} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
