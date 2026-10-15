'use client';

import { ShieldCheck } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import { createBrowserSupabaseClient } from '@/lib/supabase/browser';

type Enrolment = {
  id: string;
  qrCode: string;
  secret: string;
};

export default function AdminMfaPanel() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [aal, setAal] = useState<string>('aal1');
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void (async () => {
      const [{ data: factors }, { data: assurance }] = await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      ]);
      const verified = factors?.totp.find(
        (factor: { id: string; status: string }) => factor.status === 'verified'
      );
      setFactorId(verified?.id || null);
      setAal(assurance?.currentLevel || 'aal1');
    })();
  }, [supabase]);

  async function beginEnrolment() {
    setPending(true);
    setMessage(null);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'PriceTracker admin'
    });
    if (error) {
      setMessage(error.message);
    } else if (data?.totp) {
      setEnrolment({
        id: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret
      });
    }
    setPending(false);
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const code = String(new FormData(event.currentTarget).get('code') || '').replace(/\s/g, '');
    const id = enrolment?.id || factorId;
    if (!id) {
      setMessage('Start MFA setup first.');
      setPending(false);
      return;
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: id,
      code
    });
    if (error) {
      setMessage(error.message);
    } else {
      setFactorId(id);
      setAal('aal2');
      setEnrolment(null);
      setMessage('Administrator MFA is active for this session.');
      event.currentTarget.reset();
    }
    setPending(false);
  }

  return (
    <section className="settings-section admin-mfa">
      <span className="eyebrow"><ShieldCheck size={14} /> Administrator security</span>
      <h2>Authenticator app</h2>
      {factorId && aal === 'aal2' ? (
        <div className="form-success">MFA verified. Administrator actions are unlocked.</div>
      ) : null}
      {!factorId && !enrolment ? (
        <>
          <p>Administrator actions require a six-digit code from an authenticator app.</p>
          <button className="button secondary" type="button" onClick={beginEnrolment} disabled={pending}>
            {pending ? 'Starting…' : 'Set up authenticator'}
          </button>
        </>
      ) : null}
      {enrolment ? (
        <div className="mfa-enrolment">
          {/* Supabase returns a local data URI, not a remote image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrolment.qrCode} alt="Authenticator QR code" />
          <div>
            <p>Scan the QR code, or enter this setup key:</p>
            <code>{enrolment.secret}</code>
          </div>
        </div>
      ) : null}
      {(factorId && aal !== 'aal2') || enrolment ? (
        <form className="mfa-code-form" onSubmit={verify}>
          <label className="field">
            <span>Six-digit code</span>
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
          </label>
          <button className="button secondary" type="submit" disabled={pending}>
            {pending ? 'Verifying…' : 'Verify code'}
          </button>
        </form>
      ) : null}
      {message ? <p className="hint">{message}</p> : null}
    </section>
  );
}
