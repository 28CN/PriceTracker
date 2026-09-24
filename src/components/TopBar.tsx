import Link from 'next/link';

import NotificationsBell from './NotificationsBell';
import RefreshButton from './RefreshButton';

export default function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand-link" aria-label="PriceTracker home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="22" height="22">
              <rect x="2" y="2" width="28" height="28" rx="8" fill="currentColor" opacity="0.12" />
              <path
                d="M8 21 L13 14 L17 17 L24 9"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="24" cy="9" r="2.2" fill="currentColor" />
            </svg>
          </span>
          <p className="brand">
            Price<span>Tracker</span>
          </p>
        </Link>
        <div className="topbar-actions">
          <Link className="button topbar-manage topbar-beta" href="/beta">
            Beta
          </Link>
          <Link className="button topbar-manage" href="/manage">
            Manage
          </Link>
          <NotificationsBell />
          <RefreshButton />
        </div>
      </div>
    </header>
  );
}
