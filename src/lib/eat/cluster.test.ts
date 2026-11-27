import { describe, expect, it } from 'vitest';

import { clusterPoints } from './cluster';

describe('clusterPoints', () => {
  it('merges points closer than the pixel radius and keeps distant ones separate', () => {
    const clusters = clusterPoints(
      [
        { item: 'hj', x: 100, y: 100 },
        { item: 'z', x: 112, y: 106 },
        { item: 'g', x: 120, y: 110 },
        { item: 'kfc', x: 240, y: 200 }
      ],
      44
    );

    expect(clusters).toHaveLength(2);
    expect(clusters[0].items).toEqual(['hj', 'z', 'g']);
    expect(clusters[1].items).toEqual(['kfc']);
  });
});
