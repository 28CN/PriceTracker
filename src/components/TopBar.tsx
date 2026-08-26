import Link from 'next/link';

import NotificationsBell from './NotificationsBell';
import RefreshButton from './RefreshButton';

export default function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand-link">
          <p className="brand">PriceTracker</p>
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
