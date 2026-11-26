import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { runScheduledWork } from '@/lib/scheduledWork';

export const dynamic = 'force-dynamic';

// Called hourly by pg_cron (public.scheduled_tick) with a bearer secret.
function authorised(request: NextRequest): boolean {
  const expected = process.env.SCHEDULER_SECRET;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!expected || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const result = await runScheduledWork();
  console.info(`[scheduled] deals=${result.deals} prices=${result.prices}`);
  const failed = result.deals === 'failed' || result.prices === 'failed';
  return NextResponse.json(result, { status: failed ? 502 : 200, headers: { 'Cache-Control': 'no-store' } });
}
