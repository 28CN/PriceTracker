import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { drainOutbox } from '@/lib/emailOutbox';
import { outboxDeps } from '@/lib/emailOutboxServer';

function authorised(request: NextRequest): boolean {
  const expected = process.env.EMAIL_WORKER_SECRET;
  const supplied =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    request.headers.get('x-email-worker-secret') ||
    '';
  if (!expected || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }
  try {
    const result = await drainOutbox(outboxDeps());
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email worker failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
