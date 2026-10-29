import { beforeEach, describe, expect, it, vi } from 'vitest';

const getApiAuth = vi.fn();
vi.mock('@/lib/auth', () => ({ getApiAuth: () => getApiAuth() }));

const PID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type Result = { data: unknown; error: unknown };
/** Minimal chainable stand-in for the supabase query builder. */
function fakeDb(tables: Record<string, Result>) {
  const calls: Array<{ table: string; ops: string[] }> = [];
  const from = (table: string) => {
    const entry = { table, ops: [] as string[] };
    calls.push(entry);
    const result = tables[table] ?? { data: [], error: null };
    const builder: Record<string, unknown> = {};
    for (const op of ['select', 'eq', 'in', 'gte', 'order', 'limit']) {
      builder[op] = (...args: unknown[]) => {
        entry.ops.push(`${op}:${JSON.stringify(args.at(-1))}`);
        return builder;
      };
    }
    builder.maybeSingle = () => Promise.resolve(result);
    builder.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    // Writes must never be issued by this route.
    for (const op of ['insert', 'update', 'delete', 'upsert']) {
      builder[op] = () => {
        throw new Error(`unexpected ${op}`);
      };
    }
    return builder;
  };
  return { db: { from }, calls };
}

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

async function call(id = PID, query = '') {
  const { GET } = await import('./route');
  return GET(new Request(`http://localhost/api/products/${id}/price-insight${query}`), {
    params: Promise.resolve({ id })
  });
}

describe('GET /api/products/:id/price-insight', () => {
  beforeEach(() => getApiAuth.mockReset());

  it('401 when signed out', async () => {
    getApiAuth.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it('400 for a bad id or days, before touching auth', async () => {
    expect((await call('nope')).status).toBe(400);
    expect((await call(PID, '?days=0')).status).toBe(400);
    expect((await call(PID, '?days=1000')).status).toBe(400);
    expect(getApiAuth).not.toHaveBeenCalled();
  });

  it('404 when RLS hides the product', async () => {
    const { db } = fakeDb({ products: { data: null, error: null } });
    getApiAuth.mockResolvedValue({ supabase: db, userId: 'u', isAdmin: false });
    expect((await call()).status).toBe(404);
  });

  it('500 without leaking the database message', async () => {
    const { db } = fakeDb({ products: { data: null, error: { message: 'secret detail' } } });
    getApiAuth.mockResolvedValue({ supabase: db, userId: 'u', isAdmin: false });
    const res = await call();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
  });

  it('returns series, stats and a verdict via the caller session (demo works the same)', async () => {
    const history = [
      ...Array.from({ length: 30 }, (_, i) => ({ link_id: LID, price: '100.00', created_at: day(40 - i) })),
      { link_id: LID, price: '80.00', created_at: day(0) }
    ];
    const { db, calls } = fakeDb({
      products: { data: { id: PID, name: 'Kettle', target_price: '85' }, error: null },
      tracked_links: { data: [{ id: LID, retailer: 'Shop', url: 'https://s.example/k', stock_status: 'in_stock' }], error: null },
      price_history: { data: history, error: null },
      price_link_stats: {
        data: [{ link_id: LID, product_id: PID, current_price: '80', all_time_low: '80', all_time_low_at: day(0),
          low_30d: '80', avg_30d: '99.33', high_30d: '100', low_90d: '80', avg_90d: '99.35', high_90d: '100',
          sample_count: 31, sample_count_90d: 31, last_change_at: day(0), last_seen_at: day(0) }],
        error: null
      }
    });
    // The demo account goes through the same read path: getApiAuth, no write guard.
    getApiAuth.mockResolvedValue({ supabase: db, userId: 'd3300000-0000-4000-8000-00000000de30', isAdmin: false });

    const res = await call(PID, '?days=30');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.product).toEqual({ id: PID, name: 'Kettle', targetPrice: 85 });
    expect(body.range.days).toBe(30);
    expect(body.insight.verdict).toBe('real_discount');
    expect(body.insight.isAllTimeLow).toBe(true);
    expect(body.insight.allTimeLow.price).toBe(80);
    expect(body.links[0]).toMatchObject({ linkId: LID, retailer: 'Shop', stockStatus: 'in_stock' });
    expect(body.links[0].stats).toMatchObject({ allTimeLow: 80, avg30d: 99.33, sampleCount: 31 });
    // Chart series is trimmed to `days`, but the verdict still saw 90 days.
    expect(body.links[0].points.every((p: { at: string }) => p.at >= body.range.from)).toBe(true);
    expect(body.links[0].points.length).toBeLessThan(history.length);
    expect(body.lowest.at(-1).price).toBe(80);
    // History was scoped to this product's links and at least 90 days back.
    const ph = calls.find((c) => c.table === 'price_history')!;
    expect(ph.ops).toContain(`in:${JSON.stringify([LID])}`);
    const gte = ph.ops.find((o) => o.startsWith('gte:'))!;
    expect(Date.now() - Date.parse(JSON.parse(gte.slice(4)))).toBeGreaterThanOrEqual(89 * 86_400_000);
  });

  it('a product with no links returns empty series and insufficient_data', async () => {
    const { db, calls } = fakeDb({
      products: { data: { id: PID, name: 'New', target_price: null }, error: null },
      tracked_links: { data: [], error: null }
    });
    getApiAuth.mockResolvedValue({ supabase: db, userId: 'u', isAdmin: false });
    const body = await (await call()).json();
    expect(body.links).toEqual([]);
    expect(body.lowest).toEqual([]);
    expect(body.insight.verdict).toBe('insufficient_data');
    expect(calls.some((c) => c.table === 'price_history')).toBe(false);
  });
});
