import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { describe, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import {
  prepareCandidate,
  rankPreparedItems,
  rankSearchItems
} from '@/lib/searchMatch';

const mockRows: { query_key: string; results: unknown; fetched_at: string }[] = [];

vi.mock('@/lib/auth', () => ({
  getApiAuth: async () => ({ supabase: {}, userId: 'u-1', isAdmin: false }),
  assertSameOrigin: () => true
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => {
    const chain: Record<string, unknown> = {};
    for (const op of ['select', 'like', 'order']) chain[op] = () => chain;
    chain.limit = async () => ({ data: mockRows, error: null });
    return { from: () => chain };
  }
}));

const BRANDS = [
  'Hot Wheels', 'Matchbox', 'LEGO', 'Energizer', 'Duracell', 'Barbie',
  'Play-Doh', 'Nerf', 'Monopoly', 'Fisher-Price', 'VTech', 'Bluey',
  'Pokemon', 'Marvel', 'Star Wars', 'Disney', 'Nintendo', 'Sony',
  'Samsung', 'Philips', 'Breville', 'Sunbeam', 'Karcher', 'Bosch'
];
const NOUNS = [
  '5-Pack Cars', '10-Pack Cars', 'Storage Box', 'AA Batteries 12 Pack',
  'AAA Batteries 8 Pack', 'Track Builder Set', 'Monster Truck', 'Starter Kit',
  'Action Figure', 'Building Bricks', 'Board Game', 'Coffee Machine',
  'Electric Kettle', 'Steam Iron', 'Wireless Controller', 'Headphones'
];
const SHOPS = [
  ['Kmart', 'Big W'],
  ['Target', 'Kmart', 'Toyworld'],
  ['Coles', 'Woolworths'],
  ['Bunnings', 'Repco'],
  ['Big W', 'Amazon AU', 'Toymate']
];

const OWN_QUERIES = [
  'hotwheels',
  'hot wheels',
  'cars',
  'kmrat',
  'batteries',
  'storage boxes',
  'kmart',
  'nonexistentxyz'
];

const CACHE_QUERIES = [
  'hotwheels',
  'hot wheels',
  'cars',
  'kmrat',
  'batteries',
  'nonexistentxyz'
];

function makeProducts(count: number) {
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const brand = BRANDS[i % BRANDS.length];
    const noun = NOUNS[Math.floor(i / BRANDS.length) % NOUNS.length];
    const suffix = i >= BRANDS.length ? ` Edition ${i + 1}` : '';
    items.push({
      id: `p-${i + 1}`,
      name: `${brand} ${noun}${suffix}`,
      shops: SHOPS[i % SHOPS.length]
    });
  }
  return items;
}

function makeCacheRows(rowCount: number, hitsPerRow: number) {
  const shops = ['Kmart', 'Big W', 'Target', 'Coles', 'Woolworths', 'Toyworld'];
  const brands = ['Hot Wheels', 'LEGO', 'Matchbox', 'Energizer', 'Nerf', 'Barbie'];
  const nouns = ['5-Pack Cars', 'Storage Box', 'AA Batteries', 'Track Builder', 'Monster Truck', 'Starter Kit'];
  const rows = [];
  let hitSeq = 1;
  for (let r = 0; r < rowCount; r += 1) {
    const results = [];
    for (let h = 0; h < hitsPerRow; h += 1) {
      const idx = hitSeq++;
      results.push({
        id: String(idx),
        name: `${brands[idx % brands.length]} ${nouns[(idx >> 1) % nouns.length]} #${idx}`,
        price: 5 + (idx % 40),
        imageUrl: null,
        shop: shops[idx % shops.length],
        token: `tok-${idx}`,
        supported: idx % 2 === 0
      });
    }
    rows.push({
      query_key: `q:${brands[r % brands.length].toLowerCase().replace(/\s+/g, '')}${r}`,
      results,
      fetched_at: r % 2 === 0 ? '2026-11-23T06:00:00Z' : '2026-11-05T04:00:00Z'
    });
  }
  return rows;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function measureSync(fn: (iter: number) => void, iterations = 1000, warmup = 100) {
  for (let i = 0; i < warmup; i += 1) fn(i);
  const times: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const t0 = performance.now();
    fn(i);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return { median: percentile(times, 50), p95: percentile(times, 95) };
}

describe('Search benchmarks', () => {
  it('measures own-list filtering and mocked GET /api/search', async () => {
    const cpu = os.cpus()[0]?.model ?? 'unknown';
    console.log(`\nMachine: ${cpu} (${os.cpus().length} cores), ${os.platform()} ${os.arch()}, Node ${process.version}`);

    console.log('\n### Client-side own-list filter (1,000 iterations, 100 warmup)');
    for (const count of [21, 500]) {
      const products = makeProducts(count);
      const prepared = products.map((item) => ({
        item,
        prepared: prepareCandidate({ name: item.name, shops: item.shops })
      }));

      const prep = measureSync((i) => {
        rankPreparedItems(OWN_QUERIES[i % OWN_QUERIES.length], prepared, 5);
      });
      console.log(`rankPreparedItems (${count} products): median=${prep.median.toFixed(3)} ms, p95=${prep.p95.toFixed(3)} ms`);

      const unprep = measureSync((i) => {
        rankSearchItems(OWN_QUERIES[i % OWN_QUERIES.length], products, (p) => ({ name: p.name, shops: p.shops }), 5);
      });
      console.log(`rankSearchItems (${count} products): median=${unprep.median.toFixed(3)} ms, p95=${unprep.p95.toFixed(3)} ms`);
    }

    const { GET } = await import('@/app/api/search/route');
    console.log('\n### Mocked GET /api/search (1,000 iterations, 50 warmup)');

    const prodLikeRows = makeCacheRows(3, 8);
    (prodLikeRows[2].results as unknown[]).splice(6); // 8 + 8 + 6 = 22 results

    for (const [label, rows] of [
      ['3 rows / 22 results', prodLikeRows],
      ['50 rows / 500 results', makeCacheRows(50, 10)]
    ] as const) {
      mockRows.length = 0;
      mockRows.push(...rows);

      for (let i = 0; i < 50; i += 1) {
        await GET(new NextRequest(`http://localhost/api/search?q=${encodeURIComponent(CACHE_QUERIES[i % CACHE_QUERIES.length])}`));
      }

      const times: number[] = [];
      for (let i = 0; i < 1000; i += 1) {
        const q = CACHE_QUERIES[i % CACHE_QUERIES.length];
        const t0 = performance.now();
        const res = await GET(new NextRequest(`http://localhost/api/search?q=${encodeURIComponent(q)}`));
        await res.json();
        times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      console.log(`GET /api/search (${label}): median=${percentile(times, 50).toFixed(3)} ms, p95=${percentile(times, 95).toFixed(3)} ms`);
    }
  }, 30_000);
});
