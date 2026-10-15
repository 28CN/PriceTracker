'use client';

import { CheckCircle2, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export default function VerifyEmailPanel({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function verify() {
    setState('pending');
    const response = await fetch('/api/account/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setState('error');
      setMessage(result?.error || 'Could not verify this email.');
      return;
    }
    setState('success');
  }

  return (
    <section className="auth-shell token-panel">
      <span className="auth-mark">
        {state === 'success' ? <CheckCircle2 size={22} /> : <MailCheck size={22} />}
      </span>
      <span className="eyebrow">Email verification</span>
      <h1>{state === 'success' ? 'Email verified' : 'Confirm this email'}</h1>
      <p>
        {state === 'success'
          ? 'You can now enable password recovery and price alert emails.'
          : 'Confirm that you want this address connected to your PriceTracker account.'}
      </p>
      {state === 'error' ? <div className="form-error">{message}</div> : null}
      {state === 'success' ? (
        <Link href="/account" className="button auth-submit">Return to account</Link>
      ) : (
        <button
          type="button"
          className="button auth-submit"
          onClick={verify}
          disabled={state === 'pending' || !token}
        >
          {state === 'pending' ? 'Verifying…' : 'Verify email'}
        </button>
      )}
    </section>
  );
}
