import { NextRequest, NextResponse } from 'next/server';

import {
  assertSameOrigin,
  consumeAuthRateLimit,
  normalizeUsername,
  validateUsername
} from '@/lib/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const INVALID_CREDENTIALS = 'Incorrect username or password.';

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const username = normalizeUsername(body?.username);
  const password = typeof body?.password === 'string' ? body.password : '';

  if (validateUsername(username, true) || !password) {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  }

  const allowed = await consumeAuthRateLimit(request, 'login', username, 10);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in 15 minutes.' },
      { status: 429 }
    );
  }

  const admin = createAdminSupabaseClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  let authEmail: string | null = null;
  if (profile?.id) {
    const { data: account } = await admin
      .from('account_private')
      .select('auth_email')
      .eq('user_id', profile.id)
      .maybeSingle();
    authEmail = account?.auth_email || null;
  }

  if (!authEmail || !profile?.id) {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: authEmail,
    password
  });
  if (error) {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  }

  const [{ data: security }, { data: roles }] = await Promise.all([
    admin
      .from('user_security')
      .select('must_change_password')
      .eq('user_id', profile.id)
      .maybeSingle(),
    admin.from('user_roles').select('role').eq('user_id', profile.id)
  ]);
  const isAdmin = (roles || []).some((row) => row.role === 'admin');

  return NextResponse.json(
    {
      ok: true,
      username,
      redirectTo:
        security?.must_change_password === true
          ? '/account?security=required'
          : isAdmin
            ? '/account'
            : '/manage'
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
