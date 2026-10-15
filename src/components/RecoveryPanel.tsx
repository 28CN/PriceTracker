'use client';

import { KeyRound } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useState } from 'react';

export default function RecoveryPanel({
  mode,
  token = ''
}: {
  mode: 'request' | 'reset';
  token?: string;
}) {
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') || '');
    if (mode === 'reset' && password !== String(form.get('confirmPassword') || '')) {
      setError('The passwords do not match.');
      setPending(false);
      return;
    }
    const response = await fetch(
      mode === 'request' ? '/api/auth/recover' : '/api/auth/reset-password',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'request'
            ? { username: form.get('username') }
            : { token, password }
        )
      }
    );
    const result = (await response.json().catch(() => null)) as
      | { error?: string; message?: string }
      | null;
    if (!response.ok) {
      setError(result?.error || 'Could not complete the request.');
      setPending(false);
      return;
    }
    setSuccess(true);
    setPending(false);
  }

  const resetting = mode === 'reset';
  return (
    <section className="auth-shell">
      <span className="auth-mark"><KeyRound size={22} /></span>
      <span className="eyebrow">Account recovery</span>
      <h1>{resetting ? 'Choose a new password' : 'Reset your password'}</h1>
      <p>
        {success
          ? resetting
            ? 'Your password has been changed. You can sign in now.'
            : 'If the account has a verified email, a reset link is on its way.'
          : resetting
            ? 'Choose a new password with 8–72 characters.'
            : 'Enter your username. For privacy, we will not reveal whether the account exists.'}
      </p>

      {success ? (
        <Link href="/login" className="button auth-submit">Return to sign in</Link>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          {resetting ? (
            <>
              <label className="field">
                <span>New password</span>
                <input name="password" type="password" minLength={8} maxLength={72} required />
              </label>
              <label className="field">
                <span>Confirm new password</span>
                <input
                  name="confirmPassword"
                  type="password"
                  minLength={8}
                  maxLength={72}
                  required
                />
              </label>
            </>
          ) : (
            <label className="field">
              <span>Username</span>
              <input name="username" type="text" autoComplete="username" required />
            </label>
          )}
          {error ? <div className="form-error">{error}</div> : null}
          <button className="button auth-submit" type="submit" disabled={pending || (resetting && !token)}>
            {pending ? 'Please wait…' : resetting ? 'Set new password' : 'Send reset link'}
          </button>
        </form>
      )}
    </section>
  );
}
