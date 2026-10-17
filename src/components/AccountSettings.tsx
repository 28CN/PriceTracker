'use client';

import { Camera, CheckCircle2, Eye, EyeOff, LoaderCircle, MoreHorizontal, ShieldCheck, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';

import { createBrowserSupabaseClient } from '@/lib/supabase/browser';

export type AccountSettingsData = {
  userId: string;
  username: string;
  displayName: string;
  bio: string;
  avatarPath: string | null;
  watchlistVisibility: 'private' | 'public';
  publicSlug: string;
  contactEmail: string;
  contactEmailVerified: boolean;
  phone: string;
  phoneCountry: string;
  allowProductImprovement: boolean;
  targetPriceEmail: boolean;
  popularDealsEmail: boolean;
  personalisedRecommendationsEmail: boolean;
  digestFrequency: 'instant' | 'daily' | 'weekly';
  timezone: string;
};

function Message({ value }: { value: { type: 'ok' | 'error'; text: string } | null }) {
  if (!value) return null;
  return (
    <div className={value.type === 'ok' ? 'form-success' : 'form-error'} role="status">
      {value.text}
    </div>
  );
}

export default function AccountSettings({ initial }: { initial: AccountSettingsData }) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [avatarPath, setAvatarPath] = useState(initial.avatarPath);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [securityMessage, setSecurityMessage] =
    useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [dataMessage, setDataMessage] =
    useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [clearing, setClearing] = useState<'watchlist' | 'price-history' | null>(null);

  const avatarUrl = avatarPath
    ? supabase.storage.from('avatars').getPublicUrl(avatarPath).data.publicUrl
    : null;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/account', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: form.get('displayName'),
        bio: form.get('bio'),
        watchlistVisibility: form.get('watchlistVisibility'),
        publicSlug: form.get('publicSlug'),
        contactEmail: form.get('contactEmail'),
        phone: form.get('phone'),
        phoneCountry: form.get('phoneCountry'),
        allowProductImprovement: form.get('allowProductImprovement') === 'on',
        targetPriceEmail: form.get('targetPriceEmail') === 'on',
        popularDealsEmail: form.get('popularDealsEmail') === 'on',
        personalisedRecommendationsEmail:
          form.get('personalisedRecommendationsEmail') === 'on',
        digestFrequency: 'weekly',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || initial.timezone
      })
    });
    const result = (await response.json().catch(() => null)) as
      | { error?: string; emailNeedsVerification?: boolean }
      | null;
    if (!response.ok) {
      setMessage({ type: 'error', text: result?.error || 'Could not save your settings.' });
    } else {
      setMessage({
        type: 'ok',
        text: result?.emailNeedsVerification
          ? 'Settings saved. Verify the new email before alerts can be delivered.'
          : 'Account settings saved.'
      });
      router.refresh();
    }
    setSaving(false);
  }

  async function uploadAvatar(file: File | undefined) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setMessage({ type: 'error', text: 'Choose a JPG, PNG, WebP or GIF image.' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Avatar images must be smaller than 2 MB.' });
      return;
    }

    setUploading(true);
    setMessage(null);
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${initial.userId}/avatar-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      setMessage({ type: 'error', text: uploadError.message });
      setUploading(false);
      return;
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ avatar_path: path })
      .eq('id', initial.userId);
    if (profileError) {
      await supabase.storage.from('avatars').remove([path]);
      setMessage({ type: 'error', text: profileError.message });
      setUploading(false);
      return;
    }

    if (avatarPath) {
      await supabase.storage.from('avatars').remove([avatarPath]);
    }
    setAvatarPath(path);
    setMessage({ type: 'ok', text: 'Profile photo updated.' });
    setUploading(false);
    router.refresh();
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSecurityMessage(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const newPassword = String(form.get('newPassword') || '');
    if (newPassword !== String(form.get('confirmPassword') || '')) {
      setSecurityMessage({ type: 'error', text: 'The new passwords do not match.' });
      return;
    }
    setChangingPassword(true);
    try {
      const response = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword })
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setSecurityMessage({ type: 'error', text: result?.error || 'Could not change password.' });
        return;
      }
      formElement.reset();
      setSecurityMessage({ type: 'ok', text: 'Password changed.' });
      router.refresh();
    } catch {
      setSecurityMessage({ type: 'error', text: 'Could not connect. Please try again.' });
    } finally {
      setChangingPassword(false);
    }
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeleteMessage(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/account/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: form.get('password'),
        confirmation: form.get('confirmation')
      })
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setDeleteMessage(result?.error || 'Could not delete the account.');
      return;
    }
    router.push('/register');
    router.refresh();
  }

  async function clearData(scope: 'watchlist' | 'price-history') {
    const label = scope === 'watchlist' ? 'your entire watchlist' : 'all saved price history';
    if (!window.confirm(`Permanently clear ${label}? This cannot be undone.`)) return;
    setClearing(scope);
    setDataMessage(null);
    const response = await fetch('/api/account/data', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope })
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    setClearing(null);
    if (!response.ok) {
      setDataMessage({
        type: 'error',
        text: result?.error || 'Could not clear the selected data.'
      });
      return;
    }
    setDataMessage({
      type: 'ok',
      text: scope === 'watchlist' ? 'Watchlist cleared.' : 'Price history cleared.'
    });
    router.refresh();
  }

  return (
    <div className="account-settings">
      <form onSubmit={save}>
        <section className="settings-section">
          <div className="settings-section-heading">
            <div>
              <span className="eyebrow">Profile</span>
              <h2>How you appear</h2>
            </div>
            <label className="avatar-editor">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(event) => uploadAvatar(event.target.files?.[0])}
                disabled={uploading}
              />
              <span className="avatar-preview">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" />
                ) : (
                  initial.username.slice(0, 1).toUpperCase()
                )}
              </span>
              <span><Camera size={15} /> {uploading ? 'Uploading…' : 'Change photo'}</span>
            </label>
          </div>

          <div className="settings-grid">
            <label className="field">
              <span>Username</span>
              <input value={initial.username} disabled readOnly />
              <small>Used to sign in. It is not shown on your public page.</small>
            </label>
            <label className="field">
              <span>Display name</span>
              <input
                name="displayName"
                type="text"
                defaultValue={initial.displayName}
                maxLength={60}
                placeholder="Name shown on your public profile"
              />
            </label>
          </div>
          <label className="field">
            <span>Bio</span>
            <textarea
              name="bio"
              defaultValue={initial.bio}
              maxLength={280}
              rows={3}
              placeholder="A short optional introduction"
            />
          </label>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading">
            <div>
              <span className="eyebrow">Contact</span>
              <h2>Recovery and alerts</h2>
            </div>
            {initial.contactEmailVerified ? (
              <span className="verified-badge"><CheckCircle2 size={14} /> Verified</span>
            ) : null}
          </div>
          <div className="settings-grid">
            <label className="field">
              <span>Email</span>
              <input
                name="contactEmail"
                type="email"
                defaultValue={initial.contactEmail}
                placeholder="you@example.com"
              />
              <small>
                {initial.contactEmailVerified
                  ? 'Verified for recovery and alerts.'
                  : 'Verification is required before email can be sent.'}
              </small>
            </label>
            <label className="field">
              <span>Mobile number</span>
              <span className="phone-field">
                <select name="phoneCountry" defaultValue={initial.phoneCountry || 'AU'}>
                  <option value="AU">AU +61</option>
                  <option value="NZ">NZ +64</option>
                  <option value="GB">UK +44</option>
                  <option value="US">US +1</option>
                  <option value="CA">CA +1</option>
                  <option value="CN">CN +86</option>
                </select>
                <input name="phone" type="tel" defaultValue={initial.phone} />
              </span>
              <small>SMS alerts are not enabled yet.</small>
            </label>
          </div>
        </section>

        <section className="settings-section">
          <span className="eyebrow">Privacy</span>
          <h2>Watchlist and data use</h2>
          <label className="choice-row">
            <span>
              <strong>Watchlist visibility</strong>
              <small>Public lists are read-only for visitors.</small>
            </span>
            <select name="watchlistVisibility" defaultValue={initial.watchlistVisibility}>
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </label>
          <label className="field">
            <span>Public name</span>
            <input
              name="publicSlug"
              type="text"
              defaultValue={initial.publicSlug}
              maxLength={30}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="hiahiahia"
            />
            <small>
              {initial.watchlistVisibility === 'public' && initial.publicSlug
                ? `Visitors open /${initial.publicSlug}. Your login name stays private.`
                : 'Required before the watchlist can be public. Visitors open /this-name, which is separate from your login name.'}
            </small>
          </label>
          <label className="choice-row">
            <span>
              <strong>Help improve PriceTracker</strong>
              <small>Allow anonymised watchlist data to be used for recommendations and debugging.</small>
            </span>
            <input
              name="allowProductImprovement"
              type="checkbox"
              defaultChecked={initial.allowProductImprovement}
            />
          </label>
        </section>

        <section className="settings-section">
          <span className="eyebrow">Email preferences</span>
          <h2>Choose what reaches your inbox</h2>
          <label className="choice-row">
            <span>
              <strong>Target price alerts</strong>
              <small>Send when a tracked price reaches your target or less.</small>
            </span>
            <input
              name="targetPriceEmail"
              type="checkbox"
              defaultChecked={initial.targetPriceEmail}
            />
          </label>
          <label className="choice-row">
            <span>
              <strong>Popular deals</strong>
              <small>Occasional noteworthy deals across public watchlists.</small>
            </span>
            <input
              name="popularDealsEmail"
              type="checkbox"
              defaultChecked={initial.popularDealsEmail}
            />
          </label>
          <label className="choice-row">
            <span>
              <strong>Personalised recommendations</strong>
              <small>Suggestions based on products you already track.</small>
            </span>
            <input
              name="personalisedRecommendationsEmail"
              type="checkbox"
              defaultChecked={initial.personalisedRecommendationsEmail}
            />
          </label>
          <label className="choice-row">
            <span>
              <strong>Weekly alert</strong>
              <small>Sent once after the first price check completed on or after Wednesday.</small>
            </span>
            <span className="preference-value">Wednesday</span>
          </label>
        </section>

        <Message value={message} />
        <button type="submit" className="button settings-save" disabled={saving}>
          {saving ? 'Saving…' : 'Save account settings'}
        </button>
      </form>

      <details className="account-other-options">
        <summary><MoreHorizontal size={18} /> Other options</summary>
      <section className="settings-section" id="security">
        <span className="eyebrow"><ShieldCheck size={14} /> Security</span>
        <h2>Change password</h2>
        <form className="security-form" onSubmit={changePassword}>
          <label className="field">
            <span>New password</span>
            <span className="input-with-icon password-input">
              <input
                name="newPassword"
                type={showNewPassword ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                disabled={changingPassword}
                required
              />
              <button
                type="button"
                className="password-visibility"
                onClick={() => setShowNewPassword((value) => !value)}
                aria-label={showNewPassword ? 'Hide password' : 'Show password'}
              >
                {showNewPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
            <small>8–72 characters.</small>
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <span className="input-with-icon password-input">
              <input
                name="confirmPassword"
                type={showNewPassword ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                disabled={changingPassword}
                required
              />
              <button
                type="button"
                className="password-visibility"
                onClick={() => setShowNewPassword((value) => !value)}
                aria-label={showNewPassword ? 'Hide password' : 'Show password'}
              >
                {showNewPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>
          <div className="security-feedback">
            <Message value={securityMessage} />
            <button type="submit" className="button secondary" disabled={changingPassword}>
              {changingPassword ? (
                <><LoaderCircle className="spin" size={16} /> Updating password…</>
              ) : (
                'Change password'
              )}
            </button>
          </div>
        </form>
      </section>

      <section className="settings-section danger-zone">
        <span className="eyebrow"><Trash2 size={14} /> Danger zone</span>
        <h2>Data and account</h2>
        <p>These actions are permanent.</p>
        <div className="data-action-list">
          <button
            type="button"
            className="button secondary"
            onClick={() => clearData('price-history')}
            disabled={clearing !== null}
          >
            {clearing === 'price-history' ? 'Clearing…' : 'Clear price history'}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => clearData('watchlist')}
            disabled={clearing !== null}
          >
            {clearing === 'watchlist' ? 'Clearing…' : 'Clear watchlist'}
          </button>
        </div>
        <Message value={dataMessage} />
        <details>
          <summary className="button danger-button">Delete my account</summary>
          <form className="delete-account-form" onSubmit={deleteAccount}>
            <label className="field">
              <span>Type {initial.username} to confirm</span>
              <input name="confirmation" type="text" autoComplete="off" required />
            </label>
            <label className="field">
              <span>Password</span>
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            {deleteMessage ? <div className="form-error">{deleteMessage}</div> : null}
            <button type="submit" className="button danger-button">Permanently delete account</button>
          </form>
        </details>
      </section>
      </details>
    </div>
  );
}
