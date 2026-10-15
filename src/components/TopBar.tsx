import { ChartNoAxesCombined, Settings2 } from 'lucide-react';
import Link from 'next/link';

import NotificationsBell from './NotificationsBell';
import RefreshButton from './RefreshButton';
import ThemeToggle from './ThemeToggle';

export default function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand-link" aria-label="PriceTracker home">
          <span className="brand-mark" aria-hidden="true">
            <ChartNoAxesCombined size={21} />
          </span>
          <p className="brand">
            Price<span>Tracker</span>
          </p>
        </Link>
        <div className="topbar-actions">
          <Link className="button topbar-manage" href="/manage">
            <Settings2 size={16} aria-hidden="true" />
            Manage
          </Link>
          <ThemeToggle />
          <NotificationsBell />
          <RefreshButton />
        </div>
      </div>
    </header>
  );
}
