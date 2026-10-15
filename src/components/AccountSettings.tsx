'use client';

import { Camera, CheckCircle2, ShieldCheck, Trash2 } from 'lucide-react';
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
        contactEmail: form.get('contactEmail'),
        phone: form.get('phone'),
        phoneCountry: form.get('phoneCountry'),
        allowProductImprovement: form.get('allowProductImprovement') === 'on',
        targetPriceEmail: form.get('targetPriceEmail') === 'on',
        popularDealsEmail: form.get('popularDealsEmail') === 'on',
        personalisedRecommendationsEmail:
          form.get('personalisedRecommendationsEmail') === 'on',
        digestFrequency: form.get('digestFrequency'),
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
    const response = await fetch('/api/account/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: form.get('currentPassword'),
        newPassword
      })
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setSecurityMessage({ type: 'error', text: result?.error || 'Could not change password.' });
      return;
    }
    formElement.reset();
    setSecurityMessage({ type: 'ok', text: 'Password changed.' });
    router.refresh();
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
              <small>Your profile URL is /{initial.username}.</small>
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
              <strong>Delivery frequency</strong>
              <small>Target alerts are normally most useful immediately.</small>
            </span>
            <select name="digestFrequency" defaultValue={initial.digestFrequency}>
              <option value="instant">Immediately</option>
              <option value="daily">Daily summary</option>
              <option value="weekly">Weekly summary</option>
            </select>
          </label>
        </section>

        <Message value={message} />
        <button type="submit" className="button settings-save" disabled={saving}>
          {saving ? 'Saving…' : 'Save account settings'}
        </button>
      </form>

      <section className="settings-section" id="security">
        <span className="eyebrow"><ShieldCheck size={14} /> Security</span>
        <h2>Change password</h2>
        <form className="security-form" onSubmit={changePassword}>
          <label className="field">
            <span>Current password</span>
            <input name="currentPassword" type="password" autoComplete="current-password" required />
          </label>
          <label className="field">
            <span>New password</span>
            <input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              required
            />
            <small>8–72 characters.</small>
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              required
            />
          </label>
          <Message value={securityMessage} />
          <button type="submit" className="button secondary">Change password</button>
        </form>
      </section>

      <section className="settings-section danger-zone">
        <span className="eyebrow"><Trash2 size={14} /> Danger zone</span>
        <h2>Delete account</h2>
        <p>Deletes your profile, tracked products, alerts and saved account data.</p>
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
    </div>
  );
}
