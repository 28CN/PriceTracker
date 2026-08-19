import Link from 'next/link';

import NotificationsBell from './NotificationsBell';
import RefreshButton from './RefreshButton';

export default function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          <p className="brand">PriceTracker</p>
        </Link>
        <div className="topbar-actions">
          <Link className="button" href="/manage">
            Manage
          </Link>
          <NotificationsBell />
          <RefreshButton />
        </div>
      </div>
    </header>
  );
}
