import { beforeEach, describe, expect, it, vi } from 'vitest';

const getApiAuth = vi.fn();
vi.mock('@/lib/auth', () => ({ getApiAuth: () => getApiAuth() }));

const PID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type Result = { data: unknown; error: unknown };
const DAY_MS = 86_400_000;
/** Minimal chainable stand-in for the supabase query builder. */
function fakeDb(tables: Record<string, Result>) {
  const calls: Array<{ table: string; ops: string[] }> = [];
  const from = (table: string) => {
    const entry = { table, ops: [] as string[] };
    calls.push(entry);
    const result = tables[table] ?? { data: [], error: null };
    const builder: Record<string, unknown> = {};
    let current: Result = result;
    // .range(from, to) slices array data like PostgREST paging would.
    builder.range = (from: number, to: number) => {
      entry.ops.push(`range:${from}-${to}`);
      current = Array.isArray(result.data) ? { ...result, data: result.data.slice(from, to + 1) } : result;
      return builder;
    };
    for (const op of ['select', 'eq', 'in', 'gte', 'order', 'limit']) {
      builder[op] = (...args: unknown[]) => {
        entry.ops.push(`${op}:${JSON.stringify(args.at(-1))}`);
        return builder;
      };
    }
    builder.maybeSingle = () => Promise.resolve(result);
    builder.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(current).then(resolve, reject);
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
      ...Array.from({ length: 30 }, (_, i) => dailyRow(LID, 40 - i, '100.00')),
      dailyRow(LID, 0, '80.00')
    ];
    const { db, calls } = fakeDb({
      products: { data: { id: PID, name: 'Kettle', target_price: '85' }, error: null },
      tracked_links: { data: [{ id: LID, retailer: 'Shop', url: 'https://s.example/k', stock_status: 'in_stock' }], error: null },
      price_link_daily: { data: history, error: null },
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
    const ph = calls.find((c) => c.table === 'price_link_daily')!;
    expect(ph.ops).toContain(`in:${JSON.stringify([LID])}`);
    const gte = ph.ops.find((o) => o.startsWith('gte:'))!;
    expect(Date.now() - Date.parse(JSON.parse(gte.slice(4)))).toBeGreaterThanOrEqual(89 * 86_400_000);
    // v1.1: raw price_history is read (never written) only for this link and the chart range.
    const raw = calls.find((c) => c.table === 'price_history')!;
    expect(raw.ops).toContain(`in:${JSON.stringify([LID])}`);
    expect(raw.ops).toContain(`gte:${JSON.stringify(body.range.from)}`);
    // Unknown retailer 'Shop' -> default cycle.
    expect(body.links[0].promo).toEqual({ retailer: 'Shop', timezone: 'Australia/Sydney', anchorWeekday: 3, cycleDays: 7, isDefault: true });
  });

  it('adds promo periods and coverage per link from raw scrapes and the cycle table', async () => {
    const { db } = fakeDb({
      products: { data: { id: PID, name: 'Kettle', target_price: null }, error: null },
      tracked_links: { data: [{ id: LID, retailer: 'COLES', url: 'https://c.example/k', stock_status: 'in_stock' }], error: null },
      price_history: { data: [{ link_id: LID, price: '9.50', created_at: day(1) }, { link_id: LID, price: '8.00', created_at: day(1) }], error: null },
      retailer_promo_cycles: { data: [{ retailer: 'Coles', anchor_weekday: 3, cycle_days: 7, timezone: 'Australia/Sydney' }], error: null }
    });
    getApiAuth.mockResolvedValue({ supabase: db, userId: 'u', isAdmin: false });
    const body = await (await call(PID, '?days=30')).json();
    const link = body.links[0];
    expect(link.promo).toMatchObject({ retailer: 'COLES', isDefault: false, cycleDays: 7 });
    expect(link.periods.length).toBeGreaterThanOrEqual(5);
    expect(link.periods.at(-1).minPrice ?? link.periods.at(-2).minPrice).toBe(8);
    expect(link.periods[0].start).toMatch(/T00:00:00\+1[01]:00$/);
    expect(link.coverage).toMatchObject({ observed: 1, total: link.periods.length });
  });

  it('500 when the promo cycle table cannot be read', async () => {
    const { db } = fakeDb({
      products: { data: { id: PID, name: 'K', target_price: null }, error: null },
      tracked_links: { data: [{ id: LID, retailer: 'Coles', url: 'u', stock_status: null }], error: null },
      retailer_promo_cycles: { data: null, error: { message: 'x' } }
    });
    getApiAuth.mockResolvedValue({ supabase: db, userId: 'u', isAdmin: false });
    expect((await call()).status).toBe(500);
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
    expect(calls.some((c) => c.table === 'price_link_daily')).toBe(false);
  });

  it('pages past the 1000-row PostgREST cap so the newest days are used', async () => {
    // 6 links x 200 days = 1200 daily rows (> one page), ascending by day.
    const links = Array.from({ length: 6 }, (_, i) => `bbbbbbbb-bbbb-4bbb-8bbb-00000000000${i}`);
    const rows: ReturnType<typeof dailyRow>[] = [];
    for (let d = 199; d >= 0; d--) for (const l of links) rows.push(dailyRow(l, d, d === 0 ? '70.00' : '100.00'));
    expect(rows.length).toBeGreaterThan(1000);
    const { db, calls } = fakeDb({
      products: { data: { id: PID, name: 'Kettle', target_price: null }, error: null },
      tracked_links: { data: links.map((id) => ({ id, retailer: 'S', url: 'https://s.example', stock_status: 'in_stock' })), error: null },
      price_link_daily: { data: rows, error: null },
      price_link_stats: {
        data: links.map((l) => ({ link_id: l, product_id: PID, current_price: '72', last_seen_at: rows.at(-1)!.last_at,
          all_time_low: '70', all_time_low_at: day(0), sample_count: 200, sample_count_90d: 90 })),
        error: null
      }
    });
    getApiAuth.mockResolvedValue({ supabase: db, userId: 'u', isAdmin: false });
    const body = await (await call(PID, '?days=180')).json();
    const daily = calls.filter((c) => c.table === 'price_link_daily');
    expect(daily.length).toBe(2);
    expect(daily[1].ops).toContain('range:1000-1999');
    // Today's daily min was 70 but the live price is 72: the newest point is the live price.
    expect(body.insight.currentPrice).toBe(72);
    expect(body.lowest.at(-1).price).toBe(body.insight.currentPrice);
    expect(body.links[5].points.at(-1).price).toBe(72);
    expect(body.insight.verdict).toBe('real_discount');
    expect(body.insight.allTimeLow.price).toBe(70);
  });

  it('returns 500 instead of truncating past the hard cap', async () => {
    const { MAX_DAILY_ROWS } = await import('@/lib/priceInsight');
    const rows = Array.from({ length: MAX_DAILY_ROWS + 1 }, (_, i) => dailyRow(LID, i % 365, '1'));
    const { db } = fakeDb({
      products: { data: { id: PID, name: 'K', target_price: null }, error: null },
      tracked_links: { data: [{ id: LID, retailer: 'S', url: 'u', stock_status: null }], error: null },
      price_link_daily: { data: rows, error: null }
    });
    getApiAuth.mockResolvedValue({ supabase: db, userId: 'u', isAdmin: false });
    expect((await call()).status).toBe(500);
  });
});

function dailyRow(linkId: string, daysAgo: number, price: string) {
  const at = new Date(Date.now() - daysAgo * DAY_MS);
  return { link_id: linkId, day: at.toISOString().slice(0, 10), min_price: price, last_at: at.toISOString() };
}
