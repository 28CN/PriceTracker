'use client';

import { LogOut, Settings, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export default function AccountMenu({
  username,
  displayName,
  publicSlug,
  hideSettings = false
}: {
  username: string;
  displayName: string | null;
  publicSlug: string | null;
  hideSettings?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const node = wrapRef.current;
      if (node && !node.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function logout() {
    setPending(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/login');
  }

  return (
    <div className="account-menu panel-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`icon-button account-trigger${open ? ' is-open' : ''}`}
        aria-label="Open account menu"
        aria-expanded={open}
        title="Account"
        onClick={() => setOpen((current) => !current)}
      >
        <UserRound size={18} aria-hidden="true" />
      </button>
      {open ? (
        <div className="panel account-menu-panel">
          <div className="account-menu-identity">
            <strong>{displayName || username}</strong>
            <span>@{username}</span>
          </div>
          {hideSettings ? null : (
            <Link href="/account" onClick={() => setOpen(false)}>
              <Settings size={15} aria-hidden="true" />
              Account settings
            </Link>
          )}
          {publicSlug ? (
            <Link href={`/${publicSlug}`} onClick={() => setOpen(false)}>
              <UserRound size={15} aria-hidden="true" />
              Public profile
            </Link>
          ) : null}
          <button type="button" onClick={logout} disabled={pending}>
            <LogOut size={15} aria-hidden="true" />
            {pending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
