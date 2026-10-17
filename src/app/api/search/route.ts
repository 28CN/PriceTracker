import { NextRequest, NextResponse } from 'next/server';

import { assertSameOrigin, getApiAuth } from '@/lib/auth';
import { allowProductSearch, createProductSearch } from '@/lib/productSearch';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const auth = await getApiAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const query = typeof body?.query === 'string' ? body.query.trim() : '';
  if (!query || query.length > 120) {
    return NextResponse.json({ error: 'Enter a product name to search.' }, { status: 400 });
  }

  const provider = createProductSearch();
  if (!provider) {
    return NextResponse.json({ configured: false, results: [] });
  }

  const allowed = await allowProductSearch(auth.userId);
  if (!allowed) {
    return NextResponse.json(
      { error: "You've reached today's search limit." },
      { status: 429 }
    );
  }

  try {
    const results = await provider.search(query);
    return NextResponse.json({ configured: true, results });
  } catch (error) {
    console.error('[search] provider failed:', error);
    return NextResponse.json(
      { error: 'Product search is unavailable right now.' },
      { status: 502 }
    );
  }
}
