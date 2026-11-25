import { describe, expect, it } from "vitest";

import { basketRowFor, shopCellFor, summariseBasket } from "./basket";
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

describe("basketRowFor", () => {
  it("skips products sold at neither supermarket", () => {
    expect(basketRowFor(product("Hot Wheels", [link("Kmart", 2)]))).toBeNull();
  });

  it("matches shops by name or link and picks the cheaper fresh one", () => {
    const row = basketRowFor(
      product("Milo 1kg", [
        link("Coles", 12),
        link("Woolies", 10, { url: "https://www.woolworths.com.au/shop/x" }),
      ]),
    );
    expect(row?.cheapest).toEqual({ shop: "woolworths", price: 10 });
    expect(row?.inBasket).toBe(true);
  });

  it("keeps a product sold at one shop, but out of the totals", () => {
    const row = basketRowFor(product("Beans", [link("Woolworths", 1.5)]));
    expect(row?.cells.coles.kind).toBe("not_tracked");
    expect(row?.cheapest).toEqual({ shop: "woolworths", price: 1.5 });
    expect(row?.inBasket).toBe(false);
  });
});

describe("summariseBasket", () => {
  const list = [
    product("Milo 1kg", [link("Coles", 12), link("Woolworths", 10)]),
    product("Tim Tam 200g", [link("Coles", 4.5), link("Woolworths", 5.1)]),
    product("Vegemite 380g", [link("Coles", 7), link("Woolworths", 7.3)]),
    product("Beans 420g", [link("Woolworths", 1.5)]),
    product("Soap 200g", [
      link("Coles", 4.7, { priceStale: true }),
      link("Woolworths", 4.7),
    ]),
    product("LEGO", [link("Kmart", 6.5)]),
  ];

  it("totals only products with a fresh price at both shops", () => {
    const summary = summariseBasket(list);
    expect(summary.comparedCount).toBe(3);
    expect(summary.leftOutCount).toBe(2);
    expect(summary.totals).toEqual({
      coles: 23.5,
      woolworths: 22.4,
      split: 21.5,
    });
    expect(summary.cheaperShop).toBe("woolworths");
    expect(summary.shopGap).toBeCloseTo(1.1, 10);
    expect(summary.splitSaving).toBeCloseTo(0.9, 10);
  });

  it("lists compared products first and drops non-supermarket ones", () => {
    const names = summariseBasket(list).rows.map((row) => row.product.name);
    expect(names).toEqual([
      "Milo 1kg",
      "Tim Tam 200g",
      "Vegemite 380g",
      "Beans 420g",
      "Soap 200g",
    ]);
  });

  it("adds cents exactly", () => {
    const summary = summariseBasket([
      product("A", [link("Coles", 0.1), link("Woolworths", 0.2)]),
      product("B", [link("Coles", 0.2), link("Woolworths", 0.1)]),
    ]);
    expect(summary.totals).toEqual({ coles: 0.3, woolworths: 0.3, split: 0.2 });
    expect(summary.cheaperShop).toBeNull();
    expect(summary.splitSaving).toBe(0.1);
  });

  it("handles an empty list", () => {
    const summary = summariseBasket([]);
    expect(summary.comparedCount).toBe(0);
    expect(summary.cheaperShop).toBeNull();
    expect(summary.splitSaving).toBe(0);
  });
});
