import { NextRequest, NextResponse } from 'next/server';

import { assertSameOrigin, getApiAuth } from '@/lib/auth';
import { isDemoUser, type SupabaseLike } from '@/lib/demo';
import {
  cacheKeyForQuery,
  consumeSearchQuota,
  fetchShopHits,
  normalizeQuery,
  readFreshQueryCache,
  searchSharedCache,
  serpApiKey,
  writeCache
} from '@/lib/productSearch';

export const dynamic = 'force-dynamic';

/** Free search against shared `product_search_cache` (fresh and stale rows, matched fuzzily in TS). */
export async function GET(request: NextRequest) {
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const raw = (request.nextUrl.searchParams.get('q') || '').trim();
  const query = normalizeQuery(raw);
  if (!query || raw.length > 120) {
    return NextResponse.json({ error: 'Type what you are looking for.' }, { status: 400 });
  }

  const shops = await searchSharedCache(raw);
  return NextResponse.json({ query, shops, cached: true });
}

/** Explicit live shop search (checks fresh 24h cache first, then SerpApi within quota). */
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

  // 1. Fresh 24h cache hit avoids spending SerpApi quota.
  const fresh = await readFreshQueryCache(raw);
  if (fresh) {
    return NextResponse.json({ query, shops: fresh.hits, cached: true });
  }

  // 2. Live call, signed-in real accounts only, within quota.
  const demo = await isDemoUser(auth.supabase as unknown as SupabaseLike, auth.userId);
  if (demo) {
    const fallback = await searchSharedCache(raw);
    return NextResponse.json({ query, shops: fallback, cached: fallback.length > 0, limited: 'demo' });
  }
  if (!serpApiKey()) {
    const fallback = await searchSharedCache(raw);
    return NextResponse.json({ query, shops: fallback, cached: fallback.length > 0, limited: 'off' });
  }
  const quota = await consumeSearchQuota(auth.userId);
  if (quota !== 'ok') {
    const fallback = await searchSharedCache(raw);
    return NextResponse.json({ query, shops: fallback, cached: fallback.length > 0, limited: quota });
  }

  try {
    const shops = await fetchShopHits(query);
    const cacheKey = cacheKeyForQuery(raw);
    const fetchedAt = new Date().toISOString();
    await writeCache(cacheKey, shops);
    return NextResponse.json({
      query,
      shops: shops.map((hit) => ({ ...hit, fetchedAt, stale: false })),
      cached: false
    });
  } catch (error) {
    console.error('[search] provider failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ query, shops: [], limited: 'error' });
  }
}
