'use client';

import { BellOff, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export default function UnsubscribePanel({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function unsubscribe() {
    setState('pending');
    const response = await fetch('/api/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setError(result?.error || 'Could not update your email preferences.');
      setState('error');
      return;
    }
    setState('done');
  }

  return (
    <section className="auth-shell">
      <span className="auth-mark">
        {state === 'done' ? <CheckCircle2 size={22} /> : <BellOff size={22} />}
      </span>
      <span className="eyebrow">Email preferences</span>
      <h1>{state === 'done' ? 'Alerts paused' : 'Stop target price emails?'}</h1>
      <p>
        {state === 'done'
          ? 'Target price emails are now off. Your watchlist and account are unchanged.'
          : 'This only disables target price emails. You can turn them back on from account settings.'}
      </p>
      {state === 'error' ? <div className="form-error">{error}</div> : null}
      {state === 'done' ? (
        <Link className="button auth-submit" href="/">Return to PriceTracker</Link>
      ) : (
        <button
          type="button"
          className="button auth-submit"
          onClick={unsubscribe}
          disabled={state === 'pending' || !token}
        >
          {state === 'pending' ? 'Updating…' : 'Unsubscribe'}
        </button>
      )}
    </section>
  );
}
