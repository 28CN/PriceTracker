import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { DEMO_USER_ID } from '@/lib/demo';

const getApiAuth = vi.fn();
const fetchShopHits = vi.fn();
const readCache = vi.fn();
const writeCache = vi.fn();
const consumeSearchQuota = vi.fn();
let ownProducts: { id: string; name: string }[] = [];

vi.mock('@/lib/auth', () => ({ getApiAuth: () => getApiAuth(), assertSameOrigin: () => true }));
vi.mock('@/lib/productSearch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/productSearch')>();
  return {
    ...actual,
    fetchShopHits: (q: string) => fetchShopHits(q),
    readCache: (k: string) => readCache(k),
    writeCache: (k: string, v: unknown) => writeCache(k, v),
    consumeSearchQuota: (u: string) => consumeSearchQuota(u),
    serpApiKey: () => 'k'
  };
});

function db(isDemo = false) {
  const b: Record<string, unknown> = {};
  for (const op of ['select', 'eq', 'ilike']) b[op] = () => b;
  b.limit = async () => ({ data: ownProducts, error: null });
  b.maybeSingle = async () => ({ data: { is_demo: isDemo }, error: null });
  return { from: () => b };
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

const hit = { id: '1', name: 'Car', price: 2, imageUrl: null, shop: 'Kmart', token: 't', supported: true };

describe('POST /api/search', () => {
  beforeEach(() => {
    ownProducts = [];
    for (const fn of [getApiAuth, fetchShopHits, readCache, writeCache, consumeSearchQuota]) fn.mockReset();
    readCache.mockResolvedValue(null);
    consumeSearchQuota.mockResolvedValue('ok');
    fetchShopHits.mockResolvedValue([hit]);
    getApiAuth.mockResolvedValue({ supabase: db(), userId: 'u-1', isAdmin: false });
  });

  it('401 when signed out', async () => {
    getApiAuth.mockResolvedValue(null);
    expect((await post()).status).toBe(401);
    expect(fetchShopHits).not.toHaveBeenCalled();
  });

  it('live call with a normalised query, then caches it', async () => {
    const { body } = await post();
    expect(fetchShopHits).toHaveBeenCalledWith('hot wheels');
    expect(writeCache).toHaveBeenCalledWith('q:hot wheels', [hit]);
    expect(body.shops).toEqual([hit]);
  });

  it('uses the shared cache without spending quota', async () => {
    readCache.mockResolvedValue([hit]);
    const { body } = await post();
    expect(body).toMatchObject({ cached: true, shops: [hit] });
    expect(consumeSearchQuota).not.toHaveBeenCalled();
    expect(fetchShopHits).not.toHaveBeenCalled();
  });

  it('skips shops when enough tracked products match', async () => {
    ownProducts = [1, 2, 3].map((n) => ({ id: `p${n}`, name: `Hot Wheels ${n}` }));
    const { body } = await post();
    expect(body.tracked).toHaveLength(3);
    expect(readCache).not.toHaveBeenCalled();
    expect(fetchShopHits).not.toHaveBeenCalled();
  });

  it('demo account gets cache only', async () => {
    getApiAuth.mockResolvedValue({ supabase: db(), userId: DEMO_USER_ID, isAdmin: false });
    const { body } = await post();
    expect(body.limited).toBe('demo');
    expect(consumeSearchQuota).not.toHaveBeenCalled();
    expect(fetchShopHits).not.toHaveBeenCalled();
  });

  it('reports the cap instead of calling the provider', async () => {
    consumeSearchQuota.mockResolvedValue('site_day');
    const { body } = await post();
    expect(body.limited).toBe('site_day');
    expect(fetchShopHits).not.toHaveBeenCalled();
  });
});
