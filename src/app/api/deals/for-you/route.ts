import { NextResponse } from 'next/server';

import { getApiAuth } from '@/lib/auth';
import { loadForYou } from '@/lib/dealsForYou';

export const dynamic = 'force-dynamic';

/** New deals for you since your last Deals visit: a count for the nav and a few for the dashboard. */
export async function GET() {
  try {
    const auth = await getApiAuth();
    if (!auth) return NextResponse.json({ count: 0, items: [] });
    const result = await loadForYou(auth.supabase, auth.userId);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[deals] for-you failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ count: 0, items: [] }, { status: 500 });
  }
}
