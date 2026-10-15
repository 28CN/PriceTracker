import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { assertSameOrigin } from '@/lib/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : '';
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const admin = createAdminSupabaseClient();
  const { data: unsubscribed, error } = await admin.rpc('unsubscribe_target_email', {
    candidate_token_hash: tokenHash
  });
  if (error) {
    return NextResponse.json({ error: 'Could not update email preferences.' }, { status: 500 });
  }
  if (unsubscribed !== true) {
    return NextResponse.json(
      { error: 'This unsubscribe link is invalid or has expired.' },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
