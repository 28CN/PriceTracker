import { retailerKey } from "./retailer";
import type { LinkView, ProductView } from "./types";

export type GroupShop = { key: string; name: string; url: string };
export type ShopGroup = {
  key: string;
  name: string;
  shops: readonly GroupShop[];
};

const shop = (key: string, name: string, domain: string): GroupShop => ({
  key,
  name,
  url: `https://www.${domain}`,
});

/**
 * Shops that compete, compared only with each other. Shops we support but
 * that have no rival here (Bunnings, Amazon, eBay...) are not compared.
 */
export const SHOP_GROUPS: readonly ShopGroup[] = [
  {
    key: "supermarkets",
    name: "Supermarkets",
    shops: [
      shop("coles", "Coles", "coles.com.au"),
      shop("woolworths", "Woolworths", "woolworths.com.au"),
    ],
  },
  {
    key: "variety",
    name: "Variety",
    shops: [
      shop("kmart", "Kmart", "kmart.com.au"),
      shop("target", "Target", "target.com.au"),
      shop("bigw", "Big W", "bigw.com.au"),
    ],
  },
  {
    key: "toys",
    name: "Toy shops",
    shops: [
      shop("toymate", "Toymate", "toymate.com.au"),
      shop("toysrus", "Toys R Us", "toysrus.com.au"),
      shop("toyworld", "Toyworld", "toyworld.com.au"),
    ],
  },
  {
    key: "auto",
    name: "Auto",
    shops: [
      shop("supercheapauto", "Supercheap Auto", "supercheapauto.com.au"),
      shop("repco", "Repco", "repco.com.au"),
      shop("autobarn", "Autobarn", "autobarn.com.au"),
    ],
  },
  {
    key: "pharmacy",
    name: "Pharmacy",
    shops: [
      shop("chemistwarehouse", "Chemist Warehouse", "chemistwarehouse.com.au"),
      shop("priceline", "Priceline", "priceline.com.au"),
      shop("terrywhite", "Terry White", "terrywhitechemmart.com.au"),
    ],
  },
];

/** What one shop says about one product. */
export type ShopCell =
  | { kind: "not_tracked" }
  | { kind: "fresh"; price: number; at: string | null; url: string }
  | { kind: "stale"; price: number; at: string | null; url: string }
  | { kind: "unavailable"; url: string }
  | { kind: "no_price"; url: string };

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

export type GroupRow = {
  product: ProductView;
  /** One cell for every shop in the group. */
  cells: Record<string, ShopCell>;
  /** Shops in the group with a fresh, in-stock price. */
  freshCount: number;
  /** True when 2+ shops in the group have a fresh price, so it counts. */
  compared: boolean;
  /** Cheapest fresh shop when it is strictly cheaper than the rest; null on a tie. */
  cheapest: { shop: string; price: number } | null;
};

export type ShopStanding = GroupShop & {
  /** Compared items with a fresh price here. */
  compared: number;
  /** Compared items where this shop is the cheapest. */
  wins: number;
  /** What buying those items here costs above the cheapest shop for each. */
  extra: number;
};

export type GroupSummary = {
  group: ShopGroup;
  /** Compared items first, then the rest; list order inside each. */
  rows: GroupRow[];
  /** Shops in the group with at least one tracked link. */
  shops: GroupShop[];
  /** Shops in the group with nothing tracked. */
  missingShops: GroupShop[];
  standings: ShopStanding[];
  comparedCount: number;
  /** Shop that is cheapest most often (ties: the smaller extra); null if none. */
  best: string | null;
  /** Compared items cheaper at another shop than at the best one. */
  elsewhere: {
    row: GroupRow;
    shop: string;
    price: number;
    /** Saving against the best shop; null when the best shop has no fresh price. */
    saving: number | null;
  }[];
};

const keyOf = (link: LinkView) =>
  retailerKey(link.retailer) ?? retailerKey(link.url);

export function groupRowFor(
  product: ProductView,
  group: ShopGroup,
): GroupRow | null {
  const byShop = new Map<string, LinkView[]>(
    group.shops.map(({ key }) => [key, []]),
  );
  for (const link of product.links) {
    const key = keyOf(link);
    if (key) byShop.get(key)?.push(link);
  }

  const cells: Record<string, ShopCell> = {};
  for (const { key } of group.shops)
    cells[key] = shopCellFor(byShop.get(key) ?? []);
  if (Object.values(cells).every((cell) => cell.kind === "not_tracked"))
    return null;

  const fresh = group.shops.flatMap(({ key }) => {
    const cell = cells[key];
    return cell.kind === "fresh" ? [{ shop: key, price: cell.price }] : [];
  });
  const compared = fresh.length >= 2;
  let cheapest: GroupRow["cheapest"] = null;
  if (compared) {
    const low = Math.min(...fresh.map((offer) => cents(offer.price)));
    const atLow = fresh.filter((offer) => cents(offer.price) === low);
    if (atLow.length === 1) cheapest = atLow[0];
  }

  return { product, cells, freshCount: fresh.length, compared, cheapest };
}

export function summariseGroup(
  products: ProductView[],
  group: ShopGroup,
): GroupSummary {
  const rows = products
    .map((product) => groupRowFor(product, group))
    .filter((row): row is GroupRow => row !== null);
  rows.sort((a, b) => Number(b.compared) - Number(a.compared));

  const tracked = new Set<string>();
  for (const row of rows)
    for (const { key } of group.shops)
      if (row.cells[key].kind !== "not_tracked") tracked.add(key);
  const shops = group.shops.filter(({ key }) => tracked.has(key));
  const missingShops = group.shops.filter(({ key }) => !tracked.has(key));

  const comparedRows = rows.filter((row) => row.compared);
  const standings: ShopStanding[] = shops.map((entry) => {
    let compared = 0;
    let wins = 0;
    let extra = 0;
    for (const row of comparedRows) {
      const cell = row.cells[entry.key];
      if (cell.kind !== "fresh") continue;
      compared += 1;
      if (row.cheapest?.shop === entry.key) wins += 1;
      const low = Math.min(
        ...Object.values(row.cells).flatMap((other) =>
          other.kind === "fresh" ? [cents(other.price)] : [],
        ),
      );
      extra += cents(cell.price) - low;
    }
    return { ...entry, compared, wins, extra: extra / 100 };
  });

  const ranked = standings
    .filter((standing) => standing.wins > 0)
    .toSorted(
      (a, b) =>
        b.wins - a.wins || a.extra / a.compared - b.extra / b.compared,
    );
  const best = ranked[0]?.key ?? null;

  const elsewhere: GroupSummary["elsewhere"] = [];
  if (best) {
    for (const row of comparedRows) {
      if (!row.cheapest || row.cheapest.shop === best) continue;
      const atBest = row.cells[best];
      elsewhere.push({
        row,
        shop: row.cheapest.shop,
        price: row.cheapest.price,
        saving:
          atBest.kind === "fresh"
            ? (cents(atBest.price) - cents(row.cheapest.price)) / 100
            : null,
      });
    }
    elsewhere.sort((a, b) => (b.saving ?? 0) - (a.saving ?? 0));
  }

  return {
    group,
    rows,
    shops,
    missingShops,
    standings,
    comparedCount: comparedRows.length,
    best,
    elsewhere,
  };
}

/** Groups with at least one tracked item, and how many. */
export function groupsWithItems(
  products: ProductView[],
): { group: ShopGroup; count: number }[] {
  return SHOP_GROUPS.map((group) => ({
    group,
    count: products.filter((product) => groupRowFor(product, group) !== null)
      .length,
  })).filter((entry) => entry.count > 0);
}

/** The asked-for group when it has items, else the one with the most. */
export function pickGroup(
  available: { group: ShopGroup; count: number }[],
  requested: string | null | undefined,
): ShopGroup {
  const asked = available.find((entry) => entry.group.key === requested);
  if (asked) return asked.group;
  const most = available.toSorted((a, b) => b.count - a.count)[0];
  return most?.group ?? SHOP_GROUPS[0];
}
