import { createHash, randomBytes } from 'node:crypto';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { NextRequest, NextResponse } from 'next/server';

import {
  assertSameOrigin,
  consumeAuthRateLimit,
  normalizeUsername,
  syntheticAuthEmail,
  validatePassword,
  validateUsername
} from '@/lib/auth';
import { appUrl } from '@/lib/email';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRIES = new Set<CountryCode>(['AU', 'NZ', 'GB', 'US', 'CA', 'CN']);

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const username = normalizeUsername(body?.username);
  const password = typeof body?.password === 'string' ? body.password : '';
  const contactEmail =
    typeof body?.email === 'string' && body.email.trim()
      ? body.email.trim().toLowerCase()
      : null;
  const rawPhone = typeof body?.phone === 'string' ? body.phone.trim() : '';
  const country = COUNTRIES.has(body?.country) ? (body.country as CountryCode) : 'AU';

  const usernameError = validateUsername(username);
  const passwordError = validatePassword(password);
  if (usernameError || passwordError) {
    return NextResponse.json(
      { error: usernameError || passwordError },
      { status: 400 }
    );
  }
  if (contactEmail && !EMAIL_PATTERN.test(contactEmail)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  let phoneE164: string | null = null;
  if (rawPhone) {
    const parsed = parsePhoneNumberFromString(rawPhone, country);
    if (!parsed?.isValid()) {
      return NextResponse.json({ error: 'Enter a valid mobile number.' }, { status: 400 });
    }
    phoneE164 = parsed.number;
  }

  const allowed = await consumeAuthRateLimit(request, 'register', username, 5);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in 15 minutes.' },
      { status: 429 }
    );
  }

  const admin = createAdminSupabaseClient();
  const { data: existing } = await admin
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'That username is not available.' }, { status: 409 });
  }

  const authEmail = syntheticAuthEmail(username);
  const { data, error } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: {
      username,
      contact_email: contactEmail,
      phone_e164: phoneE164,
      phone_country: rawPhone ? country : null
    }
  });

  if (error || !data.user) {
    console.error('[auth/register] could not create user:', error?.message);
    return NextResponse.json(
      { error: 'We could not create the account. Try a different username.' },
      { status: 400 }
    );
  }

  if (contactEmail) {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const { data: tokenRow } = await admin
      .from('email_verification_tokens')
      .insert({
        user_id: data.user.id,
        email: contactEmail,
        purpose: 'verify_contact',
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      })
      .select('id')
      .single();
    if (tokenRow) {
      await admin.from('email_outbox').insert({
        user_id: data.user.id,
        kind: 'verify_contact',
        recipient: contactEmail,
        payload: {
          verifyUrl: `${appUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`
        },
        dedupe_key: `verify:${tokenRow.id}`
      });
    }
  }

  const supabase = await createServerSupabaseClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: authEmail,
    password
  });
  if (signInError) {
    console.error('[auth/register] account created but sign-in failed:', signInError.message);
    return NextResponse.json(
      { ok: true, username, requiresSignIn: true },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  return NextResponse.json(
    { ok: true, username },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
