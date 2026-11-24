import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

import { assertSameOrigin, consumeAuthRateLimit } from '@/lib/auth';
import { getWritableApiAuth } from '@/lib/demoGuard';
import { resolveUserAuthEmail, validatePasswordChange } from '@/lib/passwordChange';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/config';

const PASSWORD_ATTEMPTS_PER_WINDOW = 10;

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const guard = await getWritableApiAuth();
  if (!guard.ok) return guard.response;
  const auth = guard.auth;

  const body = await request.json().catch(() => null);
  const currentPassword =
    typeof body?.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
  const validationError = validatePasswordChange({ currentPassword, newPassword });
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const allowed = await consumeAuthRateLimit(
    request,
    'password',
    auth.userId,
    PASSWORD_ATTEMPTS_PER_WINDOW
  );
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in 15 minutes.' },
      { status: 429 }
    );
  }

  const admin = createAdminSupabaseClient();
  const [{ data: account }, { data: profile }] = await Promise.all([
    admin
      .from('account_private')
      .select('auth_email')
      .eq('user_id', auth.userId)
      .maybeSingle(),
    admin.from('profiles').select('username').eq('id', auth.userId).maybeSingle()
  ]);

  const authEmail = resolveUserAuthEmail(account?.auth_email, profile?.username);
  if (!authEmail) {
    console.error('[account/password] missing auth email for user:', auth.userId);
    return NextResponse.json(
      { error: 'Could not change password. Please try again.' },
      { status: 400 }
    );
  }

  // Throwaway client so verifying the current password never mutates session cookies.
  const verifier = createClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' })
    }
  });
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: authEmail,
    password: currentPassword
  });
  if (verifyError) {
    return NextResponse.json(
      { error: 'Your current password is not right.' },
      { status: 400 }
    );
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(auth.userId, {
    password: newPassword
  });
  if (updateError) {
    console.error('[account/password] failed to update password:', updateError.message);
    return NextResponse.json(
      { error: 'Could not change password. Please try again.' },
      { status: 400 }
    );
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
