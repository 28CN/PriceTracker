import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { assertSameOrigin, validatePassword } from '@/lib/auth';
import { DEMO_USER_ID, demoReadOnlyResponse } from '@/lib/demo';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const passwordError = validatePassword(password);
  if (!token || passwordError) {
    return NextResponse.json(
      { error: passwordError || 'Reset link is invalid.' },
      { status: 400 }
    );
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const admin = createAdminSupabaseClient();
  const { data: record } = await admin
    .from('email_verification_tokens')
    .select('id, user_id, expires_at, consumed_at')
    .eq('token_hash', tokenHash)
    .eq('purpose', 'recover_password')
    .maybeSingle();
  if (
    !record ||
    record.consumed_at ||
    new Date(record.expires_at).getTime() <= Date.now()
  ) {
    return NextResponse.json(
      { error: 'This reset link is invalid or has expired.' },
      { status: 400 }
    );
  }
  if (record.user_id === DEMO_USER_ID) {
    return demoReadOnlyResponse();
  }

  const now = new Date().toISOString();
  const { data: claimed } = await admin
    .from('email_verification_tokens')
    .update({ consumed_at: now })
    .eq('id', record.id)
    .is('consumed_at', null)
    .select('id')
    .maybeSingle();
  if (!claimed) {
    return NextResponse.json({ error: 'This reset link has already been used.' }, { status: 400 });
  }

  const { error } = await admin.auth.admin.updateUserById(record.user_id, { password });
  if (error) {
    await admin
      .from('email_verification_tokens')
      .update({ consumed_at: null })
      .eq('id', record.id);
    return NextResponse.json({ error: 'Could not reset the password.' }, { status: 500 });
  }
  await admin
    .from('user_security')
    .update({ must_change_password: false, last_password_change_at: now })
    .eq('user_id', record.user_id);

  return NextResponse.json({ ok: true });
}
