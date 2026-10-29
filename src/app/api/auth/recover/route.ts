import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import {
  assertSameOrigin,
  consumeAuthRateLimit,
  normalizeUsername
} from '@/lib/auth';
import { absoluteUrl } from '@/lib/siteUrl';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

const GENERIC_RESPONSE = {
  ok: true,
  message: 'If that account has a verified email, a reset link is on its way.'
};

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const username = normalizeUsername(body?.username);
  if (!username) return NextResponse.json(GENERIC_RESPONSE);

  const allowed = await consumeAuthRateLimit(request, 'recover', username, 5);
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
  if (!profile) return NextResponse.json(GENERIC_RESPONSE);

  const { data: account } = await admin
    .from('account_private')
    .select('contact_email, contact_email_verified_at')
    .eq('user_id', profile.id)
    .maybeSingle();
  if (!account?.contact_email || !account.contact_email_verified_at) {
    return NextResponse.json(GENERIC_RESPONSE);
  }

  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  await admin
    .from('email_verification_tokens')
    .delete()
    .eq('user_id', profile.id)
    .eq('purpose', 'recover_password')
    .is('consumed_at', null);
  const { data: tokenRow } = await admin
    .from('email_verification_tokens')
    .insert({
      user_id: profile.id,
      email: account.contact_email,
      purpose: 'recover_password',
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    })
    .select('id')
    .single();

  if (tokenRow) {
    await admin.from('email_outbox').insert({
      user_id: profile.id,
      kind: 'recover_password',
      recipient: account.contact_email,
      payload: {
        recoverUrl: absoluteUrl(`/reset-password?token=${encodeURIComponent(rawToken)}`)
      },
      dedupe_key: `recover:${tokenRow.id}`
    });
  }
  return NextResponse.json(GENERIC_RESPONSE);
}
