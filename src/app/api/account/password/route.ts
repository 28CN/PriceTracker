import { NextRequest, NextResponse } from 'next/server';

import { assertSameOrigin, getApiAuth, validatePassword } from '@/lib/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const auth = await getApiAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
  const passwordError = validatePassword(newPassword);
  if (!currentPassword || passwordError) {
    return NextResponse.json(
      { error: passwordError || 'Enter your current password.' },
      { status: 400 }
    );
  }

  const admin = createAdminSupabaseClient();
  const { data: account } = await admin
    .from('account_private')
    .select('auth_email')
    .eq('user_id', auth.userId)
    .single();
  if (!account?.auth_email) {
    return NextResponse.json({ error: 'Account credentials were not found.' }, { status: 500 });
  }

  const { error: reauthError } = await auth.supabase.auth.signInWithPassword({
    email: account.auth_email,
    password: currentPassword
  });
  if (reauthError) {
    return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 });
  }

  const { error: updateError } = await auth.supabase.auth.updateUser({
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
