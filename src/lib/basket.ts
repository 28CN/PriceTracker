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

export const SMALL_STOP_LIMIT_CENTS = 200;

export type TripItem = {
  row: GroupRow;
  price: number;
};

export type TripStop = {
  shop: GroupShop;
  items: TripItem[];
  subtotal: number;
};

export type TripSmallStop = TripStop & {
  /** Saving against buying these items at summary.best. */
  saving: number;
};

export type TripSingleShop = {
  shop: GroupShop;
  /** Cost of buying every assigned item that this shop sells fresh, here. */
  cost: number;
  /** Extra cost on those items compared with the split plan. */
  extra: number;
  /** Assigned items this shop does not sell fresh. */
  missing: number;
};

export type TripPlan = {
  stops: TripStop[];
  total: number;
  unpriced: GroupRow[];
  singleShop: TripSingleShop | null;
  smallStops: TripSmallStop[];
};

export type StaleOffer = {
  shop: GroupShop;
  price: number;
  at: string | null;
};

/** Newest stale price across the group for a row with no fresh price, if any. */
export function newestStaleOffer(
  row: GroupRow,
  shops: readonly GroupShop[],
): StaleOffer | null {
  let newest: StaleOffer | null = null;
  for (const shop of shops) {
    const cell = row.cells[shop.key];
    if (cell?.kind !== "stale") continue;
    if (!newest || timestamp(cell.at) > timestamp(newest.at)) {
      newest = { shop, price: cell.price, at: cell.at };
    }
  }
  return newest;
}

/**
 * Split a group's items across shops for the lowest total.
 * Ties go to summary.best, then the shop already holding more items, then group order.
 */
export function planTrip(summary: GroupSummary): TripPlan {
  const groupShops = summary.group.shops;
  const shopByKey = new Map(groupShops.map((entry) => [entry.key, entry]));
  const assigned = new Map<number, { shop: string; price: number }>();
  const counts = new Map<string, number>();
  const unpriced: GroupRow[] = [];
  const ties: { index: number; offers: { shop: string; price: number }[] }[] =
    [];

  const record = (index: number, shop: string, price: number) => {
    assigned.set(index, { shop, price });
    counts.set(shop, (counts.get(shop) ?? 0) + 1);
  };

  summary.rows.forEach((row, index) => {
    const fresh = groupShops.flatMap(({ key }) => {
      const cell = row.cells[key];
      return cell?.kind === "fresh" ? [{ shop: key, price: cell.price }] : [];
    });
    if (fresh.length === 0) {
      unpriced.push(row);
      return;
    }

    const low = Math.min(...fresh.map((offer) => cents(offer.price)));
    const atLow = fresh.filter((offer) => cents(offer.price) === low);
    if (atLow.length === 1) {
      record(index, atLow[0].shop, atLow[0].price);
      return;
    }

    const atBest = summary.best
      ? atLow.find((offer) => offer.shop === summary.best)
      : undefined;
    if (atBest) {
      record(index, atBest.shop, atBest.price);
      return;
    }

    ties.push({ index, offers: atLow });
  });

  for (const { index, offers } of ties) {
    let winner = offers[0];
    let winnerCount = counts.get(winner.shop) ?? 0;
    for (let i = 1; i < offers.length; i += 1) {
      const candidate = offers[i];
      const candidateCount = counts.get(candidate.shop) ?? 0;
      if (candidateCount > winnerCount) {
        winner = candidate;
        winnerCount = candidateCount;
      }
    }
    record(index, winner.shop, winner.price);
  }

  const itemsByShop = new Map<string, TripItem[]>();
  const centsByShop = new Map<string, number>();
  summary.rows.forEach((row, index) => {
    const pick = assigned.get(index);
    if (!pick) return;
    const list = itemsByShop.get(pick.shop) ?? [];
    list.push({ row, price: pick.price });
    itemsByShop.set(pick.shop, list);
    centsByShop.set(
      pick.shop,
      (centsByShop.get(pick.shop) ?? 0) + cents(pick.price),
    );
  });

  const stops: TripStop[] = groupShops
    .filter(({ key }) => itemsByShop.has(key))
    .map((entry) => ({
      shop: entry,
      items: itemsByShop.get(entry.key) ?? [],
      subtotal: (centsByShop.get(entry.key) ?? 0) / 100,
    }))
    .sort((a, b) => cents(b.subtotal) - cents(a.subtotal));

  const totalCents = stops.reduce((sum, stop) => sum + cents(stop.subtotal), 0);

  let singleShop: TripSingleShop | null = null;
  const bestShop = summary.best ? shopByKey.get(summary.best) ?? null : null;
  if (bestShop && stops.length > 0) {
    let costCents = 0;
    let extraCents = 0;
    let missing = 0;
    for (const stop of stops) {
      for (const item of stop.items) {
        const atBest = item.row.cells[bestShop.key];
        if (atBest?.kind === "fresh") {
          costCents += cents(atBest.price);
          extraCents += cents(atBest.price) - cents(item.price);
        } else {
          missing += 1;
        }
      }
    }
    singleShop = {
      shop: bestShop,
      cost: costCents / 100,
      extra: extraCents / 100,
      missing,
    };
  }

  const smallStops: TripSmallStop[] = [];
  if (bestShop) {
    for (const stop of stops) {
      if (stop.shop.key === bestShop.key) continue;
      let savingCents = 0;
      let allAtBest = true;
      for (const item of stop.items) {
        const atBest = item.row.cells[bestShop.key];
        if (atBest?.kind !== "fresh") {
          allAtBest = false;
          break;
        }
        savingCents += cents(atBest.price) - cents(item.price);
      }
      if (allAtBest && savingCents < SMALL_STOP_LIMIT_CENTS) {
        smallStops.push({ ...stop, saving: savingCents / 100 });
      }
    }
  }

  return {
    stops,
    total: totalCents / 100,
    unpriced,
    singleShop,
    smallStops,
  };
}
