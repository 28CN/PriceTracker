'use client';

import { LogOut, Settings, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export default function AccountMenu({
  username,
  displayName,
  publicSlug
}: {
  username: string;
  displayName: string | null;
  publicSlug: string | null;
}) {
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/login');
  }

  return (
    <details className="account-menu panel-wrap">
      <summary
        className="icon-button account-trigger"
        aria-label="Open account menu"
        title="Account"
      >
        <UserRound size={18} aria-hidden="true" />
      </summary>
      <div className="panel account-menu-panel">
        <div className="account-menu-identity">
          <strong>{displayName || username}</strong>
          <span>@{username}</span>
        </div>
        <Link href="/account">
          <Settings size={15} aria-hidden="true" />
          Account settings
        </Link>
        {publicSlug ? (
          <Link href={`/${publicSlug}`}>
            <UserRound size={15} aria-hidden="true" />
            Public profile
          </Link>
        ) : null}
        <button type="button" onClick={logout} disabled={pending}>
          <LogOut size={15} aria-hidden="true" />
          {pending ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </details>
  );
}
