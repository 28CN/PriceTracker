import { describe, expect, it } from "vitest";

import {
  SHOP_GROUPS,
  groupRowFor,
  groupsWithItems,
  pickGroup,
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
