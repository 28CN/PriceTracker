export type ProjectedPoint<T> = {
  item: T;
  x: number;
  y: number;
};

export type PointCluster<T> = {
  items: T[];
  x: number;
  y: number;
};

/**
 * Greedy screen-space clustering: groups projected points within radiusPx
 * into a single cluster centred on the mean screen position of its members.
 */
export function clusterPoints<T>(projected: ProjectedPoint<T>[], radiusPx = 44): PointCluster<T>[] {
  const clusters: PointCluster<T>[] = [];
  const r2 = radiusPx * radiusPx;

  for (const point of projected) {
    let best: PointCluster<T> | null = null;
    let bestDist2 = r2;

    for (const cluster of clusters) {
      const dx = point.x - cluster.x;
      const dy = point.y - cluster.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist2) {
        best = cluster;
        bestDist2 = d2;
      }
    }

    if (best) {
      const n = best.items.length;
      best.x = (best.x * n + point.x) / (n + 1);
      best.y = (best.y * n + point.y) / (n + 1);
      best.items.push(point.item);
    } else {
      clusters.push({ items: [point.item], x: point.x, y: point.y });
    }
  }

  return clusters;
}
