import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { assertSameOrigin } from '@/lib/auth';
import { DEMO_USER_ID, demoReadOnlyResponse } from '@/lib/demo';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : '';
  if (!token) {
    return NextResponse.json({ error: 'Verification link is invalid.' }, { status: 400 });
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const admin = createAdminSupabaseClient();
  const { data: record } = await admin
    .from('email_verification_tokens')
    .select('id, user_id, email, expires_at, consumed_at')
    .eq('token_hash', tokenHash)
    .eq('purpose', 'verify_contact')
    .maybeSingle();

  if (
    !record ||
    record.consumed_at ||
    new Date(record.expires_at).getTime() <= Date.now()
  ) {
    return NextResponse.json(
      { error: 'This verification link is invalid or has expired.' },
      { status: 400 }
    );
  }
  if (record.user_id === DEMO_USER_ID) {
    return demoReadOnlyResponse();
  }

  const { data: account } = await admin
    .from('account_private')
    .select('contact_email')
    .eq('user_id', record.user_id)
    .single();
  if (account?.contact_email !== record.email) {
    return NextResponse.json({ error: 'The account email has changed.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const [{ error: accountError }, { error: tokenError }] = await Promise.all([
    admin
      .from('account_private')
      .update({ contact_email_verified_at: now })
      .eq('user_id', record.user_id),
    admin
      .from('email_verification_tokens')
      .update({ consumed_at: now })
      .eq('id', record.id)
      .is('consumed_at', null)
  ]);
  if (accountError || tokenError) {
    return NextResponse.json(
      { error: accountError?.message || tokenError?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
