import { NextRequest, NextResponse } from 'next/server';

import { assertSameOrigin, getApiAuth } from '@/lib/auth';
import { isDemoUser, type SupabaseLike } from '@/lib/demo';
import {
  consumeSearchQuota,
  fetchShopHits,
  MIN_TRACKED_MATCHES,
  normalizeQuery,
  readCache,
  serpApiKey,
  writeCache,
  type ShopHit
} from '@/lib/productSearch';

export const dynamic = 'force-dynamic';

type TrackedMatch = { id: string; name: string };

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const raw = typeof body?.query === 'string' ? body.query.trim() : '';
  const query = normalizeQuery(raw);
  if (!query || raw.length > 120) {
    return NextResponse.json({ error: 'Type what you are looking for.' }, { status: 400 });
  }

  const demo = await isDemoUser(auth.supabase as unknown as SupabaseLike, auth.userId);

  // 1. Our own list first.
  const pattern = `%${query.replace(/[%_\\]/g, ' ').split(' ').join('%')}%`;
  const { data: own } = await auth.supabase
    .from('products')
    .select('id, name')
    .eq('owner_id', auth.userId)
    .ilike('name', pattern)
    .limit(5);
  const tracked = (own || []) as TrackedMatch[];
  if (tracked.length >= MIN_TRACKED_MATCHES) {
    return NextResponse.json({ query, tracked, shops: [] });
  }

  // 2. Shared 24h cache.
  const cacheKey = `q:${query}`;
  const cached = await readCache<ShopHit[]>(cacheKey);
  if (cached) return NextResponse.json({ query, tracked, shops: cached, cached: true });

  // 3. Live call, signed-in real accounts only, within quota.
  if (demo) return NextResponse.json({ query, tracked, shops: [], limited: 'demo' });
  if (!serpApiKey()) return NextResponse.json({ query, tracked, shops: [], limited: 'off' });
  const quota = await consumeSearchQuota(auth.userId);
  if (quota !== 'ok') return NextResponse.json({ query, tracked, shops: [], limited: quota });

  try {
    const shops = await fetchShopHits(query);
    await writeCache(cacheKey, shops);
    return NextResponse.json({ query, tracked, shops });
  } catch (error) {
    console.error('[search] provider failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ query, tracked, shops: [], limited: 'error' });
  }
}
