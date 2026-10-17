import AccountSettings, { type AccountSettingsData } from '@/components/AccountSettings';
import AdminMfaPanel from '@/components/AdminMfaPanel';
import { requireViewer } from '@/lib/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Link from 'next/link';

function describeLatestAlert(
  alert: { status: string; sent_at: string | null; created_at: string } | null
): string {
  if (!alert) return 'No target-price email queued yet.';
  if (alert.status === 'sent' && alert.sent_at) {
    const sent = new Date(alert.sent_at);
    const when = Number.isNaN(sent.getTime())
      ? alert.sent_at
      : sent.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
    return `Latest target-price email sent ${when}.`;
  }
  if (alert.status === 'pending' || alert.status === 'retry') {
    return 'Latest target-price email is queued for the next send.';
  }
  if (alert.status === 'processing') return 'Latest target-price email is sending now.';
  if (alert.status === 'failed') return 'Latest target-price email failed to send.';
  if (alert.status === 'cancelled') return 'Latest target-price email was cancelled.';
  return `Latest target-price email is ${alert.status}.`;
}

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function AccountPage() {
  const viewer = await requireViewer('/account');
  const supabase = await createServerSupabaseClient();
  const [{ data: profile }, { data: privateAccount }, { data: preferences }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('username, display_name, bio, avatar_path, watchlist_visibility, public_slug')
        .eq('id', viewer.id)
        .single(),
      supabase
        .from('account_private')
        .select(
          'contact_email, contact_email_verified_at, phone_e164, phone_country, allow_product_improvement'
        )
        .eq('user_id', viewer.id)
        .single(),
      supabase
        .from('notification_preferences')
        .select(
          'target_price_email, popular_deals_email, personalised_recommendations_email, digest_frequency, timezone'
        )
        .eq('user_id', viewer.id)
        .single()
    ]);

  if (!profile || !privateAccount || !preferences) {
    throw new Error('Account setup is incomplete. Run the latest Supabase migration.');
  }

  let latestAlert: {
    status: string;
    sent_at: string | null;
    last_error: string | null;
    created_at: string;
  } | null = null;
  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from('email_outbox')
      .select('status, sent_at, last_error, created_at')
      .eq('user_id', viewer.id)
      .eq('kind', 'target_price')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) latestAlert = data;
  } catch (error) {
    console.error('[account] could not read alert status:', error);
  }

  const initial: AccountSettingsData = {
    userId: viewer.id,
    username: profile.username,
    displayName: profile.display_name || '',
    bio: profile.bio || '',
    avatarPath: profile.avatar_path,
    watchlistVisibility:
      profile.watchlist_visibility === 'public' ? 'public' : 'private',
    publicSlug: profile.public_slug || '',
    contactEmail: privateAccount.contact_email || '',
    contactEmailVerified: Boolean(privateAccount.contact_email_verified_at),
    phone: privateAccount.phone_e164 || '',
    phoneCountry: privateAccount.phone_country || 'AU',
    allowProductImprovement: privateAccount.allow_product_improvement === true,
    targetPriceEmail: preferences.target_price_email === true,
    popularDealsEmail: preferences.popular_deals_email === true,
    personalisedRecommendationsEmail:
      preferences.personalised_recommendations_email === true,
    digestFrequency: ['daily', 'weekly'].includes(preferences.digest_frequency)
      ? preferences.digest_frequency
      : 'instant',
    timezone: preferences.timezone || 'Australia/Sydney'
  };

  return (
    <main>
      <header className="account-page-heading">
        <span className="eyebrow">Account</span>
        <h1>Profile, privacy and alerts</h1>
        <p>Control what is public and choose which notifications are worth sending.</p>
        {viewer.isAdmin ? (
          <Link className="button secondary" href="/manage">
            Manage featured products
          </Link>
        ) : null}
      </header>
      <div className="account-settings">
        <section className="settings-section alert-status">
          <span className="eyebrow">Alert status</span>
          <h2>Target price email</h2>
          <ul>
            <li>
              Contact email:{' '}
              {privateAccount.contact_email_verified_at ? 'verified' : 'not verified yet'}
            </li>
            <li>
              Weekly target alerts: {preferences.target_price_email ? 'on' : 'off'}
            </li>
            <li>{describeLatestAlert(latestAlert)}</li>
          </ul>
          <p className="hint">
            Before your own sending domain is verified, mail can only go to the Resend
            account address. A weekly note is queued on the first check from Wednesday
            onward, Sydney time.
          </p>
        </section>
      </div>
      <AccountSettings initial={initial} />
      {viewer.isAdmin ? <div className="account-settings admin-security-wrap"><AdminMfaPanel /></div> : null}
    </main>
  );
}
