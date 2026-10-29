import { NextRequest, NextResponse } from 'next/server';

import { assertSameOrigin, validatePassword } from '@/lib/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { getWritableApiAuth } from '@/lib/demoGuard';

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const guard = await getWritableApiAuth();
  if (!guard.ok) return guard.response;
  const auth = guard.auth;

  const body = await request.json().catch(() => null);
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { error: updateError } = await admin.auth.admin.updateUserById(auth.userId, {
    password: newPassword
  });
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  await admin
    .from('user_security')
    .update({
      must_change_password: false,
      last_password_change_at: new Date().toISOString()
    })
    .eq('user_id', auth.userId);

  return NextResponse.json(
    { ok: true },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
