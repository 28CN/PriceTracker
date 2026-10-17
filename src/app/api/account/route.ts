import { createHash, randomBytes } from 'node:crypto';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { NextRequest, NextResponse } from 'next/server';

import { assertSameOrigin, getApiAuth, normalizeUsername } from '@/lib/auth';
import { appUrl } from '@/lib/email';
import { validatePublicSlug } from '@/lib/publicSlug';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRIES = new Set<CountryCode>(['AU', 'NZ', 'GB', 'US', 'CA', 'CN']);

export async function PATCH(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const auth = await getApiAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid account settings.' }, { status: 400 });
  }

  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : null;
  const bio = typeof body.bio === 'string' ? body.bio.trim() : null;
  const visibility = body.watchlistVisibility === 'public' ? 'public' : 'private';
  const admin = createAdminSupabaseClient();
  const { data: currentProfile } = await auth.supabase
    .from('profiles')
    .select('public_slug')
    .eq('id', auth.userId)
    .maybeSingle();
  let publicSlug = currentProfile?.public_slug || null;
  const requestedSlug =
    typeof body.publicSlug === 'string' ? normalizeUsername(body.publicSlug) : '';
  if (requestedSlug && requestedSlug !== publicSlug) {
    const slugError = validatePublicSlug(requestedSlug);
    if (slugError) {
      return NextResponse.json({ error: slugError, field: 'publicSlug' }, { status: 400 });
    }
    const [{ data: slugTaken }, { data: usernameTaken }] = await Promise.all([
      admin
        .from('profiles')
        .select('id')
        .eq('public_slug', requestedSlug)
        .neq('id', auth.userId)
        .maybeSingle(),
      admin
        .from('profiles')
        .select('id')
        .eq('username', requestedSlug)
        .neq('id', auth.userId)
        .maybeSingle()
    ]);
    if (slugTaken || usernameTaken) {
      return NextResponse.json(
        { error: 'That public name is already in use.', field: 'publicSlug' },
        { status: 400 }
      );
    }
    publicSlug = requestedSlug;
  }
  if (visibility === 'public' && !publicSlug) {
    return NextResponse.json(
      {
        error: 'Choose a public name before making your watchlist public.',
        field: 'publicSlug'
      },
      { status: 400 }
    );
  }
  if (displayName && displayName.length > 60) {
    return NextResponse.json(
      { error: 'Display name must be 60 characters or less.', field: 'displayName' },
      { status: 400 }
    );
  }
  if (bio && bio.length > 280) {
    return NextResponse.json(
      { error: 'Bio must be 280 characters or less.', field: 'bio' },
      { status: 400 }
    );
  }

  const contactEmail =
    typeof body.contactEmail === 'string' && body.contactEmail.trim()
      ? body.contactEmail.trim().toLowerCase()
      : null;
  if (contactEmail && !EMAIL_PATTERN.test(contactEmail)) {
    return NextResponse.json(
      { error: 'Enter a valid email address.', field: 'contactEmail' },
      { status: 400 }
    );
  }

  const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const country = COUNTRIES.has(body.phoneCountry)
    ? (body.phoneCountry as CountryCode)
    : 'AU';
  let phoneE164: string | null = null;
  if (rawPhone) {
    const parsed = parsePhoneNumberFromString(rawPhone, country);
    if (!parsed?.isValid()) {
      return NextResponse.json(
        { error: 'Enter a valid mobile number.', field: 'phone' },
        { status: 400 }
      );
    }
    phoneE164 = parsed.number;
  }

  const preferences = {
    target_price_email: body.targetPriceEmail === true,
    popular_deals_email: body.popularDealsEmail === true,
    personalised_recommendations_email: body.personalisedRecommendationsEmail === true,
    digest_frequency: 'weekly',
    timezone: typeof body.timezone === 'string' ? body.timezone : 'Australia/Sydney'
  };

  const [{ error: profileError }, { error: preferenceError }] = await Promise.all([
    auth.supabase
      .from('profiles')
      .update({
        display_name: displayName || null,
        bio: bio || null,
        watchlist_visibility: visibility,
        public_slug: publicSlug
      })
      .eq('id', auth.userId),
    auth.supabase
      .from('notification_preferences')
      .upsert({ user_id: auth.userId, ...preferences })
  ]);
  if (profileError?.code === '23505') {
    return NextResponse.json(
      { error: 'That public name is already in use.', field: 'publicSlug' },
      { status: 400 }
    );
  }
  if (profileError?.code === '23514') {
    return NextResponse.json(
      {
        error: 'Choose a public name before making your watchlist public.',
        field: 'publicSlug'
      },
      { status: 400 }
    );
  }
  if (profileError || preferenceError) {
    return NextResponse.json(
      { error: profileError?.message || preferenceError?.message },
      { status: 500 }
    );
  }

  const { data: previous } = await admin
    .from('account_private')
    .select(
      'contact_email, contact_email_verified_at, phone_e164, allow_product_improvement'
    )
    .eq('user_id', auth.userId)
    .single();

  const allowImprovement = body.allowProductImprovement === true;
  const { error: privateError } = await admin
    .from('account_private')
    .update({
      contact_email: contactEmail,
      contact_email_verified_at:
        previous?.contact_email === contactEmail ? undefined : null,
      phone_e164: phoneE164,
      phone_country: rawPhone ? country : null,
      phone_verified_at: previous?.phone_e164 === phoneE164 ? undefined : null,
      allow_product_improvement: allowImprovement
    })
    .eq('user_id', auth.userId);
  if (privateError) {
    return NextResponse.json({ error: privateError.message }, { status: 500 });
  }

  const consentRows: Array<Record<string, unknown>> = [];
  if (previous?.allow_product_improvement !== allowImprovement) {
    consentRows.push({
      user_id: auth.userId,
      consent_type: 'product_improvement',
      granted: allowImprovement,
      policy_version: '2026-10-15',
      source: 'account'
    });
  }
  consentRows.push(
    {
      user_id: auth.userId,
      consent_type: 'target_price_email',
      granted: preferences.target_price_email,
      policy_version: '2026-10-15',
      source: 'account'
    },
    {
      user_id: auth.userId,
      consent_type: 'popular_deals_email',
      granted: preferences.popular_deals_email,
      policy_version: '2026-10-15',
      source: 'account'
    },
    {
      user_id: auth.userId,
      consent_type: 'personalised_recommendations',
      granted: preferences.personalised_recommendations_email,
      policy_version: '2026-10-15',
      source: 'account'
    }
  );
  await admin.from('privacy_consents').insert(consentRows);

  const emailNeedsVerification =
    Boolean(contactEmail) &&
    (previous?.contact_email !== contactEmail || !previous?.contact_email_verified_at);
  if (emailNeedsVerification && contactEmail) {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await admin
      .from('email_verification_tokens')
      .delete()
      .eq('user_id', auth.userId)
      .eq('purpose', 'verify_contact')
      .is('consumed_at', null);
    const { data: tokenRow, error: tokenError } = await admin
      .from('email_verification_tokens')
      .insert({
        user_id: auth.userId,
        email: contactEmail,
        purpose: 'verify_contact',
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      })
      .select('id')
      .single();
    if (!tokenError && tokenRow) {
      await admin.from('email_outbox').insert({
        user_id: auth.userId,
        kind: 'verify_contact',
        recipient: contactEmail,
        payload: {
          verifyUrl: `${appUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`
        },
        dedupe_key: `verify:${tokenRow.id}`
      });
    }
  }
  return NextResponse.json({ ok: true, emailNeedsVerification });
}
