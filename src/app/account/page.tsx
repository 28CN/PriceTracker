import AccountSettings, { type AccountSettingsData } from '@/components/AccountSettings';
import AdminMfaPanel from '@/components/AdminMfaPanel';
import { requireViewer } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function AccountPage() {
  const viewer = await requireViewer('/account');
  const supabase = await createServerSupabaseClient();
  const [{ data: profile }, { data: privateAccount }, { data: preferences }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('username, display_name, bio, avatar_path, watchlist_visibility')
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

  const initial: AccountSettingsData = {
    userId: viewer.id,
    username: profile.username,
    displayName: profile.display_name || '',
    bio: profile.bio || '',
    avatarPath: profile.avatar_path,
    watchlistVisibility:
      profile.watchlist_visibility === 'public' ? 'public' : 'private',
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
      </header>
      <AccountSettings initial={initial} />
      {viewer.isAdmin ? <div className="account-settings admin-security-wrap"><AdminMfaPanel /></div> : null}
    </main>
  );
}
