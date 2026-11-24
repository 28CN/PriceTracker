'use client';

import { Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import {
  getPasswordValidityMessage,
  getUsernameValidityMessage,
  readCapsLock,
  safeNextPath
} from '@/lib/authValidation';
import { EMAIL_DISABLED_MESSAGE, isEmailUiEnabled } from '@/lib/emailFeature';
import InfoTip from './InfoTip';

const EMAIL_UI_ENABLED = isEmailUiEnabled();

type AuthPanelProps = {
  mode: 'login' | 'register';
  nextPath?: string;
};

export default function AuthPanel({ mode, nextPath }: AuthPanelProps) {
  const usernameId = useId();
  const passwordId = useId();
  const phoneId = useId();
  const errorRef = useRef<HTMLDivElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorTick, setErrorTick] = useState(0);

  const registering = mode === 'register';

  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error, errorTick]);

  function handleUsernameInvalid(event: FormEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const message = getUsernameValidityMessage(input.value, !registering);
    if (message) {
      input.setCustomValidity(message);
    }
  }

  function handlePasswordInvalid(event: FormEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const message = getPasswordValidityMessage(input.value, registering);
    if (message) {
      input.setCustomValidity(message);
    }
  }

  function handlePasswordKey(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLockOn(readCapsLock(event));
  }

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
        setErrorTick((n) => n + 1);
        setPending(false);
        return;
      }

      if (result?.requiresSignIn) {
        window.location.assign('/login?created=1');
      } else {
        window.location.assign(safeNextPath(result?.redirectTo || nextPath));
      }
    } catch {
      setError('Could not connect. Please try again.');
      setErrorTick((n) => n + 1);
      setPending(false);
    }
  }

  return (
    <section className="auth-shell" aria-labelledby="auth-title">
      <div className="auth-intro">
        <span className="auth-mark" aria-hidden="true">
          <LockKeyhole size={22} />
        </span>
        <h1 id="auth-title">{registering ? 'Create your account' : 'Welcome back'}</h1>
      </div>

      <form className="auth-form" onSubmit={submit}>
        <div className="field">
          <span className="field-label-row">
            <label htmlFor={usernameId}>Username</label>
            {registering ? (
              <InfoTip label="Username rules">
                3–30 letters, numbers or hyphens. Capitalisation does not matter.
              </InfoTip>
            ) : null}
          </span>
          <span className="input-with-icon">
            <UserRound size={17} aria-hidden="true" />
            <input
              id={usernameId}
              name="username"
              type="text"
              autoComplete="username"
              inputMode="text"
              minLength={3}
              maxLength={30}
              pattern="[A-Za-z0-9](?:[A-Za-z0-9\-]{1,28}[A-Za-z0-9])"
              placeholder="Enter username"
              onInvalid={handleUsernameInvalid}
              onInput={(event) => event.currentTarget.setCustomValidity('')}
              required
            />
          </span>
        </div>

        <div className="field">
          <span className="field-label-row">
            <label htmlFor={passwordId}>Password</label>
            {registering ? (
              <InfoTip label="Password rules">8–72 characters.</InfoTip>
            ) : null}
          </span>
          <span className="input-with-icon password-input">
            <LockKeyhole size={17} aria-hidden="true" />
            <input
              id={passwordId}
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={registering ? 'new-password' : 'current-password'}
              minLength={registering ? 8 : undefined}
              maxLength={72}
              placeholder={registering ? 'Use a memorable phrase' : 'Your password'}
              onInvalid={handlePasswordInvalid}
              onInput={(event) => event.currentTarget.setCustomValidity('')}
              onKeyDown={handlePasswordKey}
              onKeyUp={handlePasswordKey}
              onBlur={() => setCapsLockOn(false)}
              required
            />
            <button
              type="button"
              className="password-visibility"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
            </button>
          </span>
          <small className="caps-lock-hint" aria-live="polite">
            {capsLockOn ? 'Caps Lock is on' : ''}
          </small>
        </div>

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
                  disabled={!EMAIL_UI_ENABLED}
                />
                <small className={EMAIL_UI_ENABLED ? undefined : 'email-disabled-note'}>
                  {EMAIL_UI_ENABLED
                    ? 'Needed for password recovery and email price alerts.'
                    : EMAIL_DISABLED_MESSAGE}
                </small>
              </label>
              <div className="field">
                <span className="field-label-row">
                  <label htmlFor={phoneId}>Mobile number</label>
                </span>
                <span className="phone-field">
                  <select name="country" defaultValue="AU" aria-label="Country code">
                    <option value="AU">AU +61</option>
                    <option value="NZ">NZ +64</option>
                    <option value="GB">UK +44</option>
                    <option value="US">US +1</option>
                    <option value="CA">CA +1</option>
                    <option value="CN">CN +86</option>
                  </select>
                  <input
                    id={phoneId}
                    name="phone"
                    type="tel"
                    autoComplete="tel-national"
                    placeholder="0412 345 678"
                  />
                </span>
                <small>We will only verify it if you enable SMS features later.</small>
              </div>
            </div>
          </details>
        ) : (
          <div className="auth-form-link">
            {EMAIL_UI_ENABLED ? (
              <Link href="/forgot-password">Forgot password?</Link>
            ) : (
              <span className="link-disabled" aria-disabled="true" title={EMAIL_DISABLED_MESSAGE}>
                Forgot password? <small>{EMAIL_DISABLED_MESSAGE}</small>
              </span>
            )}
          </div>
        )}

        {error ? (
          <div className="form-error" role="alert" tabIndex={-1} ref={errorRef}>
            {error}
          </div>
        ) : null}

        <button className="button primary auth-submit" type="submit" disabled={pending}>
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
