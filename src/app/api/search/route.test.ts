import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { DEMO_USER_ID } from '@/lib/demo';

const getApiAuth = vi.fn();
const search = vi.fn();
vi.mock('@/lib/auth', () => ({ getApiAuth: () => getApiAuth(), assertSameOrigin: () => true }));
vi.mock('@/lib/productSearch', () => ({
  createProductSearch: () => ({ search }),
  allowProductSearch: async () => true
}));

/** profiles lookup returns is_demo for the given flag. */
function db(isDemo: boolean) {
  const b: Record<string, unknown> = {};
  for (const op of ['select', 'eq']) b[op] = () => b;
  b.maybeSingle = async () => ({ data: { is_demo: isDemo }, error: null });
  return { from: () => b };
}

async function post(query = 'kettle') {
  const { POST } = await import('./route');
  return POST(
    new NextRequest('http://localhost/api/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query })
    })
  );
}

describe('POST /api/search', () => {
  beforeEach(() => {
    getApiAuth.mockReset();
    search.mockReset();
    search.mockResolvedValue([]);
  });

  it('401 when signed out', async () => {
    getApiAuth.mockResolvedValue(null);
    expect((await post()).status).toBe(401);
    expect(search).not.toHaveBeenCalled();
  });

  it('403 demo_read_only for the demo account, without calling the provider', async () => {
    getApiAuth.mockResolvedValue({ supabase: db(false), userId: DEMO_USER_ID, isAdmin: false });
    const res = await post();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'demo_read_only' });
    expect(search).not.toHaveBeenCalled();
  });

  it('403 for any profile flagged is_demo', async () => {
    getApiAuth.mockResolvedValue({ supabase: db(true), userId: 'u-other', isAdmin: false });
    expect((await post()).status).toBe(403);
    expect(search).not.toHaveBeenCalled();
  });

  it('a regular user can search', async () => {
    getApiAuth.mockResolvedValue({ supabase: db(false), userId: 'u-1', isAdmin: false });
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: true, results: [] });
    expect(search).toHaveBeenCalledWith('kettle');
  });
});
