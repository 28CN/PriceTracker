import { NextRequest, NextResponse } from 'next/server';

import { assertSameOrigin, getApiAuth } from '@/lib/auth';
import { isDemoUser, type SupabaseLike } from '@/lib/demo';
import {
  consumeSearchQuota,
  fetchShopOffers,
  readCache,
  serpApiKey,
  writeCache,
  type ShopOffer
} from '@/lib/productSearch';

export const dynamic = 'force-dynamic';

/** Shop list (direct retailer links) for one Google Shopping product. */
export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const auth = await getApiAuth();
  if (!auth) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === 'string' && /^\d{1,30}$/.test(body.id) ? body.id : '';
  const token = typeof body?.token === 'string' && body.token.length < 4000 ? body.token : '';
  if (!id || !token) return NextResponse.json({ error: 'Bad request.' }, { status: 400 });

  const cacheKey = `p:${id}`;
  const cached = await readCache<ShopOffer[]>(cacheKey);
  if (cached) return NextResponse.json({ offers: cached, cached: true });

  if (await isDemoUser(auth.supabase as unknown as SupabaseLike, auth.userId)) {
    return NextResponse.json({ offers: [], limited: 'demo' });
  }
  if (!serpApiKey()) return NextResponse.json({ offers: [], limited: 'off' });
  const quota = await consumeSearchQuota(auth.userId);
  if (quota !== 'ok') return NextResponse.json({ offers: [], limited: quota });

  try {
    const offers = await fetchShopOffers(token);
    await writeCache(cacheKey, offers);
    return NextResponse.json({ offers });
  } catch (error) {
    console.error('[search] shops failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ offers: [], limited: 'error' });
  }
}
