import { describe, expect, it } from "vitest";

import {
  SHOP_GROUPS,
  groupRowFor,
  groupsWithItems,
  newestStaleOffer,
  pickGroup,
  planTrip,
  shopCellFor,
  summariseGroup,
} from "./basket";
import type { LinkView, ProductView } from "./types";

function link(
  retailer: string,
  price: number | null,
  extra: Partial<LinkView> = {},
): LinkView {
  return {
    id: `${retailer}-${price}`,
    retailer,
    url: `https://www.${retailer.toLowerCase()}.com.au/p/1`,
    isActive: true,
    stockStatus: "in_stock",
    latestPrice: price,
    priceStale: false,
    latestAt: "2026-11-24T00:00:00Z",
    imageUrl: null,
    imageCandidates: [],
    createdAt: null,
    ...extra,
  };
}

function product(name: string, links: LinkView[]): ProductView {
  return {
    id: name,
    name,
    categoryId: null,
    categoryName: null,
    targetPrice: null,
    imageUrl: null,
    links,
    lowestPrice: null,
    lowestRetailer: null,
  };
}

describe("shopCellFor", () => {
  it("says not tracked when the shop has no active link", () => {
    expect(shopCellFor([])).toEqual({ kind: "not_tracked" });
    expect(shopCellFor([link("Coles", 3, { isActive: false })])).toEqual({
      kind: "not_tracked",
    });
  });

  it("prefers the cheapest fresh price, even over a cheaper old one", () => {
    const cell = shopCellFor([
      link("Coles", 5),
      link("Coles", 4),
      link("Coles", 1, { priceStale: true }),
    ]);
    expect(cell).toMatchObject({ kind: "fresh", price: 4 });
  });

  it("falls back to unavailable, then the newest old price, then no price", () => {
    expect(
      shopCellFor([link("Coles", 4, { stockStatus: "unavailable" })]).kind,
    ).toBe("unavailable");
    const stale = shopCellFor([
      link("Coles", 3, { priceStale: true, latestAt: "2026-10-01T00:00:00Z" }),
      link("Coles", 6, { priceStale: true, latestAt: "2026-11-01T00:00:00Z" }),
    ]);
    expect(stale).toMatchObject({ kind: "stale", price: 6 });
    expect(shopCellFor([link("Coles", null)]).kind).toBe("no_price");
  });
});

const group = (key: string) => SHOP_GROUPS.find((entry) => entry.key === key)!;
const supermarkets = group("supermarkets");
const variety = group("variety");
const auto = group("auto");

describe("groupRowFor", () => {
  it("skips products sold at no shop in the group", () => {
    expect(groupRowFor(product("Drill", [link("Bunnings", 99)]), auto)).toBeNull();
  });

  it("matches shops by name or link and picks the strictly cheapest fresh one", () => {
    const row = groupRowFor(
      product("Car", [
        link("Kmart", 2),
        link("Shop", 3, { url: "https://www.target.com.au/p/1" }),
        link("Big W", 2.5),
      ]),
      variety,
    )!;
    expect(row.compared).toBe(true);
    expect(row.freshCount).toBe(3);
    expect(row.cheapest).toEqual({ shop: "kmart", price: 2 });
  });

  it("has no cheapest on a tie, and is not compared with one fresh price", () => {
    expect(groupRowFor(product("Milk", [link("Coles", 3), link("Woolworths", 3)]), supermarkets)!.cheapest).toBeNull();
    const one = groupRowFor(product("Milk", [link("Coles", 3), link("Woolworths", 2, { priceStale: true })]), supermarkets)!;
    expect(one.compared).toBe(false);
    expect(one.cheapest).toBeNull();
  });
});

describe("summariseGroup", () => {
  const products = [
    product("Cleaner", [link("Supercheap Auto", 20), link("Repco", 22), link("Autobarn", 21)]),
    product("Oil", [link("Supercheap Auto", 40), link("Repco", 38)]),
    product("Wax", [link("Supercheap Auto", 15), link("Repco", 16)]),
    product("Wipes", [link("Repco", 9)]),
    product("Drill", [link("Bunnings", 99)]),
  ];

  it("picks the shop that is cheapest most often and what to buy elsewhere", () => {
    const summary = summariseGroup(products, auto);
    expect(summary.comparedCount).toBe(3);
    expect(summary.best).toBe("supercheapauto");
    const sca = summary.standings.find((entry) => entry.key === "supercheapauto")!;
    expect(sca).toMatchObject({ compared: 3, wins: 2, extra: 2 });
    expect(summary.elsewhere.map((entry) => [entry.row.product.name, entry.shop, entry.saving])).toEqual([
      ["Oil", "repco", 2],
    ]);
  });

  it("lists compared items first and never pulls in shops from other groups", () => {
    const summary = summariseGroup(products, auto);
    expect(summary.rows.map((row) => row.product.name)).toEqual(["Cleaner", "Oil", "Wax", "Wipes"]);
    expect(summary.shops.map((entry) => entry.key)).toEqual(["supercheapauto", "repco", "autobarn"]);
  });

  it("names shops with nothing tracked and copes with one shop", () => {
    const summary = summariseGroup([product("Car", [link("Kmart", 2)])], variety);
    expect(summary.shops.map((entry) => entry.key)).toEqual(["kmart"]);
    expect(summary.missingShops.map((entry) => entry.key)).toEqual(["target", "bigw"]);
    expect(summary.comparedCount).toBe(0);
    expect(summary.best).toBeNull();
    expect(summary.elsewhere).toEqual([]);
  });

  it("says when the best shop has no fresh price for an item", () => {
    const summary = summariseGroup(
      [
        product("A", [link("Kmart", 1), link("Target", 2)]),
        product("B", [link("Kmart", 1), link("Big W", 2)]),
        product("C", [link("Target", 3), link("Big W", 4)]),
      ],
      variety,
    );
    expect(summary.best).toBe("kmart");
    expect(summary.elsewhere).toMatchObject([{ shop: "target", price: 3, saving: null }]);
  });

  it("adds cents exactly", () => {
    const summary = summariseGroup(
      [product("A", [link("Coles", 0.1), link("Woolworths", 0.3)]), product("B", [link("Coles", 0.2), link("Woolworths", 0.1)])],
      supermarkets,
    );
    expect(summary.standings.map((entry) => entry.extra)).toEqual([0.1, 0.2]);
  });

  it("handles an empty list", () => {
    const summary = summariseGroup([], supermarkets);
    expect(summary.rows).toEqual([]);
    expect(summary.best).toBeNull();
  });
});

describe("groups", () => {
  const products = [
    product("Car", [link("Kmart", 2), link("Target", 3)]),
    product("Lego", [link("Big W", 20)]),
    product("Milk", [link("Coles", 3)]),
  ];

  it("lists groups with items and their counts", () => {
    expect(groupsWithItems(products).map((entry) => [entry.group.key, entry.count])).toEqual([
      ["supermarkets", 1],
      ["variety", 2],
    ]);
  });

  it("uses the asked-for group when it has items, else the biggest", () => {
    const available = groupsWithItems(products);
    expect(pickGroup(available, "supermarkets").key).toBe("supermarkets");
    expect(pickGroup(available, "auto").key).toBe("variety");
    expect(pickGroup(available, null).key).toBe("variety");
    expect(pickGroup([], null).key).toBe("supermarkets");
  });
});

describe("planTrip", () => {
  it("assigns each fresh item to the cheapest shop, sorts stops by subtotal, and compares with best", () => {
    const summary = summariseGroup(
      [
        product("Milk", [link("Coles", 4), link("Woolworths", 3)]),
        product("Cheese", [link("Coles", 9), link("Woolworths", 7)]),
        product("Coffee", [link("Coles", 14), link("Woolworths", 18)]),
        product("Olive Oil", [link("Coles", 12)]),
      ],
      supermarkets,
    );
    expect(summary.best).toBe("woolworths");

    const plan = planTrip(summary);
    expect(plan.stops.map((stop) => [stop.shop.key, stop.subtotal])).toEqual([
      ["coles", 26],
      ["woolworths", 10],
    ]);
    expect(plan.stops[0].items.map((item) => [item.row.product.name, item.price])).toEqual([
      ["Coffee", 14],
      ["Olive Oil", 12],
    ]);
    expect(plan.total).toBe(36);
    expect(plan.unpriced).toEqual([]);
    expect(plan.singleShop).toMatchObject({
      shop: { key: "woolworths", name: "Woolworths" },
      cost: 28,
      extra: 4,
      missing: 1,
    });
    // Coles includes Olive Oil which Woolworths does not sell fresh, so it is not small.
    expect(plan.smallStops).toEqual([]);
  });

  it("breaks ties by summary.best, then shop already holding more items, then group order", () => {
    // summary.best is woolworths (wins 2 vs 0); tied item should go to woolworths despite coles being first in group order.
    const bestTieSummary = summariseGroup(
      [
        product("A", [link("Coles", 5), link("Woolworths", 4)]),
        product("B", [link("Coles", 6), link("Woolworths", 5)]),
        product("Tied", [link("Coles", 3), link("Woolworths", 3)]),
      ],
      supermarkets,
    );
    expect(bestTieSummary.best).toBe("woolworths");
    const bestTiePlan = planTrip(bestTieSummary);
    expect(bestTiePlan.stops.map((stop) => stop.shop.key)).toEqual(["woolworths"]);
    expect(bestTiePlan.stops[0].items.map((item) => item.row.product.name)).toEqual([
      "A",
      "B",
      "Tied",
    ]);

    // Tie between two non-best shops prefers the one already holding more items.
    const countTieSummary = summariseGroup(
      [
        product("K1", [link("Kmart", 2), link("Target", 5), link("Big W", 5)]),
        product("K2", [link("Kmart", 2), link("Target", 5), link("Big W", 5)]),
        product("B1", [link("Kmart", 9), link("Target", 8), link("Big W", 4)]),
        product("TieTB", [link("Kmart", 9), link("Target", 6), link("Big W", 6)]),
      ],
      variety,
    );
    expect(countTieSummary.best).toBe("kmart");
    const countTiePlan = planTrip(countTieSummary);
    const bigwStop = countTiePlan.stops.find((stop) => stop.shop.key === "bigw")!;
    expect(bigwStop.items.map((item) => item.row.product.name)).toEqual(["B1", "TieTB"]);
    expect(countTiePlan.stops.find((stop) => stop.shop.key === "target")).toBeUndefined();

    // Tie with no best shop and equal counts falls back to group order (kmart before target).
    const groupOrderSummary = summariseGroup(
      [product("Same", [link("Kmart", 5), link("Target", 5)])],
      variety,
    );
    expect(groupOrderSummary.best).toBeNull();
    const groupOrderPlan = planTrip(groupOrderSummary);
    expect(groupOrderPlan.stops.map((stop) => stop.shop.key)).toEqual(["kmart"]);
  });

  it("adds cents exactly for subtotals, total, singleShop and smallStops", () => {
    const summary = summariseGroup(
      [
        product("A", [link("Coles", 0.1), link("Woolworths", 0.4)]),
        product("B", [link("Coles", 0.2), link("Woolworths", 0.5)]),
        product("C", [link("Coles", 0.5), link("Woolworths", 0.1)]),
      ],
      supermarkets,
    );
    expect(summary.best).toBe("coles");
    const plan = planTrip(summary);
    const coles = plan.stops.find((stop) => stop.shop.key === "coles")!;
    const woolies = plan.stops.find((stop) => stop.shop.key === "woolworths")!;
    expect(coles.subtotal).toBe(0.3);
    expect(woolies.subtotal).toBe(0.1);
    expect(plan.total).toBe(0.4);
    expect(plan.singleShop).toMatchObject({ cost: 0.8, extra: 0.4, missing: 0 });
    expect(plan.smallStops.map((stop) => [stop.shop.key, stop.saving])).toEqual([
      ["woolworths", 0.4],
    ]);
  });

  it("flags smallStops only when saving vs best is under $2.00 and best sells all items fresh", () => {
    // Saving $1.99 at Target -> small stop. Saving $2.00 at Big W -> not small.
    const summary = summariseGroup(
      [
        product("K1", [link("Kmart", 10), link("Target", 15), link("Big W", 15)]),
        product("K2", [link("Kmart", 10), link("Target", 15), link("Big W", 15)]),
        product("T1", [link("Kmart", 5), link("Target", 3.01)]),
        product("B1", [link("Kmart", 5), link("Big W", 3)]),
      ],
      variety,
    );
    expect(summary.best).toBe("kmart");
    const plan = planTrip(summary);
    expect(plan.smallStops.map((stop) => [stop.shop.key, stop.saving])).toEqual([
      ["target", 1.99],
    ]);

    // If best lacks even one item in the stop fresh (stale or untracked), the stop is not small.
    const missingAtBestSummary = summariseGroup(
      [
        product("K1", [link("Kmart", 10), link("Target", 15)]),
        product("K2", [link("Kmart", 10), link("Target", 15)]),
        product("T1", [link("Kmart", 5), link("Target", 4)]),
        product("T2", [link("Kmart", 5, { priceStale: true }), link("Target", 4)]),
      ],
      variety,
    );
    expect(planTrip(missingAtBestSummary).smallStops).toEqual([]);
  });

  it("puts rows with no fresh price into unpriced and finds the newest stale offer", () => {
    const summary = summariseGroup(
      [
        product("Fresh", [link("Coles", 5)]),
        product("Stale", [
          link("Coles", 3, { priceStale: true, latestAt: "2026-10-01T00:00:00Z" }),
          link("Woolworths", 4, { priceStale: true, latestAt: "2026-11-05T00:00:00Z" }),
        ]),
        product("Out", [link("Coles", 6, { stockStatus: "unavailable" })]),
        product("Pending", [link("Woolworths", null)]),
      ],
      supermarkets,
    );
    const plan = planTrip(summary);
    expect(plan.stops.map((stop) => stop.shop.key)).toEqual(["coles"]);
    expect(plan.unpriced.map((row) => row.product.name)).toEqual([
      "Stale",
      "Out",
      "Pending",
    ]);

    const staleRow = plan.unpriced[0];
    expect(newestStaleOffer(staleRow, supermarkets.shops)).toMatchObject({
      shop: { key: "woolworths" },
      price: 4,
      at: "2026-11-05T00:00:00Z",
    });
    expect(newestStaleOffer(plan.unpriced[1], supermarkets.shops)).toBeNull();
  });

  it("handles a group with one shop", () => {
    const summary = summariseGroup(
      [
        product("Car", [link("Kmart", 2)]),
        product("Track", [link("Kmart", 12)]),
      ],
      variety,
    );
    const plan = planTrip(summary);
    expect(plan.stops).toHaveLength(1);
    expect(plan.stops[0].shop.key).toBe("kmart");
    expect(plan.stops[0].subtotal).toBe(14);
    expect(plan.total).toBe(14);
    expect(plan.singleShop).toBeNull();
    expect(plan.smallStops).toEqual([]);
    expect(plan.unpriced).toEqual([]);
  });

  it("handles an empty summary", () => {
    const plan = planTrip(summariseGroup([], supermarkets));
    expect(plan).toEqual({
      stops: [],
      total: 0,
      unpriced: [],
      singleShop: null,
      smallStops: [],
    });
  });
});
