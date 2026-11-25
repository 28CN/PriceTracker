import { retailerKey } from "./retailer";
import type { LinkView, ProductView } from "./types";

/** The two supermarkets compared. Other shops are left out of the basket. */
export const BASKET_SHOPS = [
  { key: "coles", name: "Coles" },
  { key: "woolworths", name: "Woolworths" },
] as const;

export type BasketShopKey = (typeof BASKET_SHOPS)[number]["key"];

/** What one shop says about one product. */
export type ShopCell =
  | { kind: "not_tracked" }
  | { kind: "fresh"; price: number; at: string | null; url: string }
  | { kind: "stale"; price: number; at: string | null; url: string }
  | { kind: "unavailable"; url: string }
  | { kind: "no_price"; url: string };

export type BasketRow = {
  product: ProductView;
  cells: Record<BasketShopKey, ShopCell>;
  /** Cheaper fresh shop of the two, or null when neither has a fresh price. */
  cheapest: { shop: BasketShopKey; price: number } | null;
  /** True when both shops have a fresh, in-stock price, so it counts in the totals. */
  inBasket: boolean;
};

export type BasketSummary = {
  rows: BasketRow[];
  /** Products in the totals: fresh price at both shops. */
  comparedCount: number;
  /** Tracked at Coles or Woolworths but left out of the totals. */
  leftOutCount: number;
  totals: Record<BasketShopKey, number> & { split: number };
  /** Cheaper single shop for the compared basket; null if empty or equal. */
  cheaperShop: BasketShopKey | null;
  /** How much the best split saves against the cheaper single shop. */
  splitSaving: number;
  /** How much the cheaper single shop saves against the dearer one. */
  shopGap: number;
};

const cents = (value: number) => Math.round(value * 100);

function timestamp(iso: string | null): number {
  const value = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(value) ? 0 : value;
}

/** Best answer from one shop's links: cheapest fresh, else newest stale, else unavailable, else no price. */
export function shopCellFor(links: LinkView[]): ShopCell {
  const active = links.filter((link) => link.isActive);
  if (active.length === 0) return { kind: "not_tracked" };

  let fresh: LinkView | null = null;
  let stale: LinkView | null = null;
  let unavailable: LinkView | null = null;

  for (const link of active) {
    if (link.stockStatus === "unavailable") {
      unavailable ??= link;
      continue;
    }
    if (link.latestPrice === null || !Number.isFinite(link.latestPrice))
      continue;
    if (!link.priceStale) {
      if (!fresh || link.latestPrice < (fresh.latestPrice as number))
        fresh = link;
    } else if (!stale || timestamp(link.latestAt) > timestamp(stale.latestAt)) {
      stale = link;
    }
  }

  if (fresh)
    return {
      kind: "fresh",
      price: fresh.latestPrice as number,
      at: fresh.latestAt,
      url: fresh.url,
    };
  if (unavailable) return { kind: "unavailable", url: unavailable.url };
  if (stale)
    return {
      kind: "stale",
      price: stale.latestPrice as number,
      at: stale.latestAt,
      url: stale.url,
    };
  return { kind: "no_price", url: active[0].url };
}

export function basketRowFor(product: ProductView): BasketRow | null {
  const byShop: Record<BasketShopKey, LinkView[]> = {
    coles: [],
    woolworths: [],
  };
  for (const link of product.links) {
    const key = retailerKey(link.retailer) ?? retailerKey(link.url);
    if (key === "coles" || key === "woolworths") byShop[key].push(link);
  }
  if (byShop.coles.length === 0 && byShop.woolworths.length === 0) return null;

  const cells = {
    coles: shopCellFor(byShop.coles),
    woolworths: shopCellFor(byShop.woolworths),
  };
  if (
    cells.coles.kind === "not_tracked" &&
    cells.woolworths.kind === "not_tracked"
  )
    return null;

  let cheapest: BasketRow["cheapest"] = null;
  for (const { key } of BASKET_SHOPS) {
    const cell = cells[key];
    if (cell.kind === "fresh" && (!cheapest || cell.price < cheapest.price)) {
      cheapest = { shop: key, price: cell.price };
    }
  }

  return {
    product,
    cells,
    cheapest,
    inBasket: cells.coles.kind === "fresh" && cells.woolworths.kind === "fresh",
  };
}

export function summariseBasket(products: ProductView[]): BasketSummary {
  const rows = products
    .map(basketRowFor)
    .filter((row): row is BasketRow => row !== null);
  // Compared products first, then the rest; keep list order inside each group.
  rows.sort((a, b) => Number(b.inBasket) - Number(a.inBasket));

  let coles = 0;
  let woolworths = 0;
  let split = 0;
  let comparedCount = 0;
  for (const row of rows) {
    if (
      !row.inBasket ||
      row.cells.coles.kind !== "fresh" ||
      row.cells.woolworths.kind !== "fresh"
    )
      continue;
    comparedCount += 1;
    coles += cents(row.cells.coles.price);
    woolworths += cents(row.cells.woolworths.price);
    split += cents(Math.min(row.cells.coles.price, row.cells.woolworths.price));
  }

  const cheaperShop: BasketShopKey | null =
    comparedCount === 0 || coles === woolworths
      ? null
      : coles < woolworths
        ? "coles"
        : "woolworths";
  const bestSingle = Math.min(coles, woolworths);

  return {
    rows,
    comparedCount,
    leftOutCount: rows.length - comparedCount,
    totals: {
      coles: coles / 100,
      woolworths: woolworths / 100,
      split: split / 100,
    },
    cheaperShop,
    splitSaving: (bestSingle - split) / 100,
    shopGap: Math.abs(coles - woolworths) / 100,
  };
}
