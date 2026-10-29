import { NextRequest, NextResponse } from 'next/server';

import { assertSameOrigin } from '@/lib/auth';
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
  const password = typeof body?.password === 'string' ? body.password : '';
  const confirmation = typeof body?.confirmation === 'string'
    ? body.confirmation.trim().toLowerCase()
    : '';

  const admin = createAdminSupabaseClient();
  const [{ data: profile }, { data: account }] = await Promise.all([
    admin.from('profiles').select('username, avatar_path').eq('id', auth.userId).single(),
    admin.from('account_private').select('auth_email').eq('user_id', auth.userId).single()
  ]);
  if (!profile || !account) {
    return NextResponse.json({ error: 'Account was not found.' }, { status: 404 });
  }
  if (confirmation !== profile.username) {
    return NextResponse.json(
      { error: `Type ${profile.username} to confirm deletion.` },
      { status: 400 }
    );
  }

  const { error: reauthError } = await auth.supabase.auth.signInWithPassword({
    email: account.auth_email,
    password
  });
  if (reauthError) {
    return NextResponse.json({ error: 'Password is incorrect.' }, { status: 401 });
  }

  await admin
    .from('email_outbox')
    .update({ status: 'cancelled' })
    .eq('user_id', auth.userId)
    .in('status', ['pending', 'retry', 'processing']);

  if (profile.avatar_path) {
    await admin.storage.from('avatars').remove([profile.avatar_path]);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(auth.userId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  await auth.supabase.auth.signOut().catch(() => undefined);
  return NextResponse.json(
    { ok: true },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
