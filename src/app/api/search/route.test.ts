import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { DEMO_USER_ID } from '@/lib/demo';

const getApiAuth = vi.fn();
const assertSameOrigin = vi.fn();
const fetchShopHits = vi.fn();
const readFreshQueryCache = vi.fn();
const searchSharedCache = vi.fn();
const writeCache = vi.fn();
const consumeSearchQuota = vi.fn();

vi.mock('@/lib/auth', () => ({
  getApiAuth: () => getApiAuth(),
  assertSameOrigin: (req: NextRequest) => assertSameOrigin(req)
}));
vi.mock('@/lib/productSearch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/productSearch')>();
  return {
    ...actual,
    fetchShopHits: (q: string) => fetchShopHits(q),
    readFreshQueryCache: (q: string) => readFreshQueryCache(q),
    searchSharedCache: (q: string) => searchSharedCache(q),
    writeCache: (k: string, v: unknown) => writeCache(k, v),
    consumeSearchQuota: (u: string) => consumeSearchQuota(u),
    serpApiKey: () => 'k'
  };
});

function db(isDemo = false) {
  const b: Record<string, unknown> = {};
  for (const op of ['select', 'eq']) b[op] = () => b;
  b.maybeSingle = async () => ({ data: { is_demo: isDemo }, error: null });
  return { from: () => b };
}

async function getCache(query = 'hotwheels') {
  const { GET } = await import('./route');
  const res = await GET(
    new NextRequest(`http://localhost/api/search?q=${encodeURIComponent(query)}`)
  );
  return { status: res.status, body: await res.json() };
}

async function post(query = 'Hot  Wheels!') {
  const { POST } = await import('./route');
  const res = await POST(
    new NextRequest('http://localhost/api/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query })
    })
  );
  return { status: res.status, body: await res.json() };
}

const hit = { id: '1', name: 'Hot Wheels Car', price: 2, imageUrl: null, shop: 'Kmart', token: 't', supported: true };
const staleHit = { ...hit, fetchedAt: '2026-11-05T04:00:00Z', stale: true };

describe('GET /api/search (free shared cache)', () => {
  beforeEach(() => {
    for (const fn of [getApiAuth, assertSameOrigin, fetchShopHits, readFreshQueryCache, searchSharedCache, writeCache, consumeSearchQuota]) {
      fn.mockReset();
    }
    assertSameOrigin.mockReturnValue(true);
    getApiAuth.mockResolvedValue({ supabase: db(), userId: 'u-1', isAdmin: false });
    searchSharedCache.mockResolvedValue([staleHit]);
  });

  it('401 when signed out', async () => {
    getApiAuth.mockResolvedValue(null);
    expect((await getCache()).status).toBe(401);
    expect(searchSharedCache).not.toHaveBeenCalled();
  });

  it('returns cached matches without spending quota or calling SerpApi', async () => {
    const { status, body } = await getCache('hotwheels');
    expect(status).toBe(200);
    expect(searchSharedCache).toHaveBeenCalledWith('hotwheels');
    expect(body).toMatchObject({ query: 'hotwheels', cached: true, shops: [staleHit] });
    expect(consumeSearchQuota).not.toHaveBeenCalled();
    expect(fetchShopHits).not.toHaveBeenCalled();
  });

  it('400 on empty query', async () => {
    expect((await getCache('   ')).status).toBe(400);
  });
});

describe('POST /api/search (live shop search)', () => {
  beforeEach(() => {
    for (const fn of [getApiAuth, assertSameOrigin, fetchShopHits, readFreshQueryCache, searchSharedCache, writeCache, consumeSearchQuota]) {
      fn.mockReset();
    }
    assertSameOrigin.mockReturnValue(true);
    readFreshQueryCache.mockResolvedValue(null);
    searchSharedCache.mockResolvedValue([]);
    consumeSearchQuota.mockResolvedValue('ok');
    fetchShopHits.mockResolvedValue([hit]);
    getApiAuth.mockResolvedValue({ supabase: db(), userId: 'u-1', isAdmin: false });
  });

  it('403 on cross-origin request', async () => {
    assertSameOrigin.mockReturnValue(false);
    expect((await post()).status).toBe(403);
    expect(fetchShopHits).not.toHaveBeenCalled();
  });

  it('401 when signed out', async () => {
    getApiAuth.mockResolvedValue(null);
    expect((await post()).status).toBe(401);
    expect(fetchShopHits).not.toHaveBeenCalled();
  });

  it('live call with a normalised query, then caches under compact key', async () => {
    const { body } = await post('Hot  Wheels!');
    expect(fetchShopHits).toHaveBeenCalledWith('hot wheels');
    expect(writeCache).toHaveBeenCalledWith('q:hotwheels', [hit]);
    expect(body.shops[0]).toMatchObject({ id: '1', name: 'Hot Wheels Car', stale: false });
    expect(body.cached).toBe(false);
  });

  it('uses fresh shared cache without spending quota', async () => {
    readFreshQueryCache.mockResolvedValue({ hits: [{ ...hit, stale: false }], fetchedAt: '2026-11-23T06:00:00Z' });
    const { body } = await post('hotwheels');
    expect(body).toMatchObject({ cached: true, shops: [{ ...hit, stale: false }] });
    expect(consumeSearchQuota).not.toHaveBeenCalled();
    expect(fetchShopHits).not.toHaveBeenCalled();
  });

  it('demo account gets cached fallback only and never spends quota', async () => {
    getApiAuth.mockResolvedValue({ supabase: db(true), userId: DEMO_USER_ID, isAdmin: false });
    searchSharedCache.mockResolvedValue([staleHit]);
    const { body } = await post();
    expect(body.limited).toBe('demo');
    expect(body.shops).toEqual([staleHit]);
    expect(consumeSearchQuota).not.toHaveBeenCalled();
    expect(fetchShopHits).not.toHaveBeenCalled();
  });

  it('reports the cap and returns stale cache fallback instead of calling the provider', async () => {
    consumeSearchQuota.mockResolvedValue('site_day');
    searchSharedCache.mockResolvedValue([staleHit]);
    const { body } = await post();
    expect(body.limited).toBe('site_day');
    expect(body.shops).toEqual([staleHit]);
    expect(fetchShopHits).not.toHaveBeenCalled();
  });
});
