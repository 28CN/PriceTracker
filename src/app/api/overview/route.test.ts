import { beforeEach, describe, expect, it, vi } from 'vitest';

const getApiAuth = vi.fn();
vi.mock('@/lib/auth', () => ({ getApiAuth: () => getApiAuth() }));

const DAY_MS = 86_400_000;
type Result = { data: unknown; error: unknown };

function fakeDb(tables: Record<string, Result>) {
  const calls: Array<{ table: string; ops: string[] }> = [];
  const from = (table: string) => {
    const entry = { table, ops: [] as string[] };
    calls.push(entry);
    const result = tables[table] ?? { data: [], error: null };
    const builder: Record<string, unknown> = {};
    let current: Result = result;
    builder.range = (fromIdx: number, toIdx: number) => {
      entry.ops.push(`range:${fromIdx}-${toIdx}`);
      current = Array.isArray(result.data)
        ? { ...result, data: result.data.slice(fromIdx, toIdx + 1) }
        : result;
      return builder;
    };
    for (const op of ['select', 'eq', 'in', 'gte', 'order', 'limit']) {
      builder[op] = (...args: unknown[]) => {
        entry.ops.push(`${op}:${JSON.stringify(args.at(-1))}`);
        return builder;
      };
    }
    builder.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(current).then(resolve, reject);
    for (const op of ['insert', 'update', 'delete', 'upsert']) {
      builder[op] = () => {
        throw new Error(`unexpected ${op}`);
      };
    }
    return builder;
  };
  return { db: { from }, calls };
}

function dailyRow(linkId: string, daysAgo: number, price: string) {
  const at = new Date(Date.now() - daysAgo * DAY_MS);
  return {
    link_id: linkId,
    day: at.toISOString().slice(0, 10),
    min_price: price,
    last_at: at.toISOString()
  };
}

async function call() {
  const { GET } = await import('./route');
  return GET();
}

describe('GET /api/overview', () => {
  beforeEach(() => getApiAuth.mockReset());

  it('returns 401 when signed out', async () => {
    getApiAuth.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it('returns empty overview and private cache header when user has no products', async () => {
    const { db, calls } = fakeDb({
      products: { data: [], error: null }
    });
    getApiAuth.mockResolvedValue({ supabase: db, userId: 'u1', isAdmin: false });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=60');
    const body = await res.json();
    expect(body.trackedCount).toBe(0);
    expect(body.biggestDrops).toEqual([]);
    expect(calls.some((c) => c.table === 'price_link_daily')).toBe(false);
  });

  it('computes overview from owner products and price_link_daily with private caching', async () => {
    const { db, calls } = fakeDb({
      products: {
        data: [{ id: 'p1', name: 'Kettle', target_price: '45.00' }],
        error: null
      },
      tracked_links: {
        data: [{ id: 'l1', product_id: 'p1', retailer: 'Kmart', is_active: true, stock_status: 'in_stock' }],
        error: null
      },
      price_link_daily: {
        data: [dailyRow('l1', 10, '60.00'), dailyRow('l1', 1, '40.00')],
        error: null
      }
    });
    getApiAuth.mockResolvedValue({ supabase: db, userId: 'u1', isAdmin: false });

    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=60');
    const body = await res.json();
    expect(body.trackedCount).toBe(1);
    expect(body.belowGoalCount).toBe(1);
    expect(body.droppedThisWeekCount).toBe(1);
    expect(body.biggestDrops).toEqual([
      {
        productId: 'p1',
        linkId: 'l1',
        name: 'Kettle',
        retailer: 'Kmart',
        oldPrice: 60,
        newPrice: 40
      }
    ]);
    expect(body.newlyBelowGoal).toHaveLength(1);
    // Scoped to the caller's own products.
    const prodCall = calls.find((c) => c.table === 'products')!;
    expect(prodCall.ops).toContain('eq:"u1"');
  });

  it('returns 500 without leaking DB errors', async () => {
    const { db } = fakeDb({
      products: { data: null, error: { message: 'secret schema info' } }
    });
    getApiAuth.mockResolvedValue({ supabase: db, userId: 'u1', isAdmin: false });

    const res = await call();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
  });
});
