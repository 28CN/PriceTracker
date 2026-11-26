export type DailyPriceRow = { link_id: string; product_id: string; day: string; min_price: number | string };

export type Spark = { points: number[]; low: number; high: number };

/**
 * Daily lowest price for one product, oldest first. When the deal's shop has
 * links for the product, only those count; otherwise every link does.
 */
export function sparkFor(rows: readonly DailyPriceRow[], productId: string, shopLinkIds: readonly string[]): Spark | null {
  const own = rows.filter((row) => row.product_id === productId);
  const shop = own.filter((row) => shopLinkIds.includes(row.link_id));
  const chosen = shop.length >= 2 ? shop : own;
  const byDay = new Map<string, number>();
  for (const row of chosen) {
    const price = Number(row.min_price);
    if (!Number.isFinite(price)) continue;
    const prev = byDay.get(row.day);
    if (prev === undefined || price < prev) byDay.set(row.day, price);
  }
  const points = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, price]) => price);
  if (points.length < 2) return null;
  return { points, low: Math.min(...points), high: Math.max(...points) };
}

/** SVG polyline points in a w x h box; a flat line sits in the middle. */
export function sparkPoints(points: readonly number[], w: number, h: number, pad = 2): string {
  const low = Math.min(...points);
  const high = Math.max(...points);
  const span = high - low;
  const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  return points
    .map((price, i) => {
      const x = pad + i * step;
      const y = span === 0 ? h / 2 : pad + (1 - (price - low) / span) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
