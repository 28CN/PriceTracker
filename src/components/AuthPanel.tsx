'use client';

import { Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

type AuthPanelProps = {
  mode: 'login' | 'register';
  nextPath?: string;
};

function safeNextPath(value: string | undefined): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/manage';
}

export default function AuthPanel({ mode, nextPath }: AuthPanelProps) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const payload =
      mode === 'register'
        ? {
            username: form.get('username'),
            password: form.get('password'),
            email: form.get('email'),
            phone: form.get('phone'),
            country: form.get('country')
          }
        : {
            username: form.get('username'),
            password: form.get('password')
          };

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = (await response.json().catch(() => null)) as
        | { error?: string; requiresSignIn?: boolean; redirectTo?: string }
        | null;

      if (!response.ok) {
        setError(result?.error || 'Something went wrong. Please try again.');
        setPending(false);
        return;
      }

      if (result?.requiresSignIn) {
        router.replace('/login?created=1');
      } else {
        router.replace(safeNextPath(result?.redirectTo || nextPath));
      }
    } catch {
      setError('Could not connect. Please try again.');
      setPending(false);
    }
  }

  const registering = mode === 'register';

  return (
    <section className="auth-shell" aria-labelledby="auth-title">
      <div className="auth-intro">
        <span className="auth-mark" aria-hidden="true">
          <LockKeyhole size={22} />
        </span>
        <span className="eyebrow">Your watchlist, your account</span>
        <h1 id="auth-title">{registering ? 'Create your account' : 'Welcome back'}</h1>
        <p>
          {registering
            ? 'Start with the essentials. You can add alerts and profile details later.'
            : 'Sign in to manage tracked products and price alerts.'}
        </p>
      </div>

      <form className="auth-form" onSubmit={submit}>
        <label className="field">
          <span>Username</span>
          <span className="input-with-icon">
            <UserRound size={17} aria-hidden="true" />
            <input
              name="username"
              autoComplete="username"
              inputMode="text"
              minLength={3}
              maxLength={30}
              pattern="[A-Za-z0-9](?:[A-Za-z0-9-]{1,28}[A-Za-z0-9])"
              placeholder="Enter username"
              required
            />
          </span>
          {registering ? (
            <small>3–30 letters, numbers or hyphens. Capitalisation does not matter.</small>
          ) : null}
        </label>

        <label className="field">
          <span>Password</span>
          <span className="input-with-icon password-input">
            <LockKeyhole size={17} aria-hidden="true" />
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={registering ? 'new-password' : 'current-password'}
              minLength={registering ? 8 : undefined}
              maxLength={72}
              placeholder={registering ? 'Use a memorable phrase' : 'Your password'}
              required
            />
            <button
              type="button"
              className="password-visibility"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
          {registering ? (
            <small>8–72 characters.</small>
          ) : null}
        </label>

        {registering ? (
          <details className="optional-contact">
            <summary>Add recovery and alert details <span>Optional</span></summary>
            <div className="optional-contact-fields">
              <label className="field">
                <span>Email</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                />
                <small>Needed for password recovery and email price alerts.</small>
              </label>
              <label className="field">
                <span>Mobile number</span>
                <span className="phone-field">
                  <select name="country" defaultValue="AU" aria-label="Country">
                    <option value="AU">AU +61</option>
                    <option value="NZ">NZ +64</option>
                    <option value="GB">UK +44</option>
                    <option value="US">US +1</option>
                    <option value="CA">CA +1</option>
                    <option value="CN">CN +86</option>
                  </select>
                  <input
                    name="phone"
                    type="tel"
                    autoComplete="tel-national"
                    placeholder="0412 345 678"
                  />
                </span>
                <small>We will only verify it if you enable SMS features later.</small>
              </label>
            </div>
          </details>
        ) : (
          <div className="auth-form-link">
            <Link href="/forgot-password">Forgot password?</Link>
          </div>
        )}

        {error ? <div className="form-error" role="alert">{error}</div> : null}

        <button className="button auth-submit" type="submit" disabled={pending}>
          {pending ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}
        </button>

        <p className="auth-switch">
          {registering ? 'Already have an account?' : 'New to PriceTracker?'}{' '}
          <Link href={registering ? '/login' : '/register'}>
            {registering ? 'Sign in' : 'Create account'}
          </Link>
        </p>
      </form>

      {registering ? (
        <p className="auth-legal">
          By creating an account, you agree to the Terms and acknowledge the Privacy notice.
        </p>
      ) : null}
    </section>
  );
}
