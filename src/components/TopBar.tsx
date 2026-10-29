import { ChartNoAxesCombined, Settings2 } from 'lucide-react';
import Link from 'next/link';

import { getViewer } from '@/lib/auth';

import AccountMenu from './AccountMenu';
import ExitDemoButton from './ExitDemoButton';
import NotificationsBell from './NotificationsBell';
import RefreshButton from './RefreshButton';
import ThemeToggle from './ThemeToggle';

export default async function TopBar() {
  const viewer = await getViewer();

  return (
    <header className="topbar">
      <div className="topbar-inner">
        {viewer?.isDemo ? (
          <ExitDemoButton className="brand-link brand-exit" label="Leave the sample and go to PriceTracker home">
          <span className="brand-mark" aria-hidden="true">
            <ChartNoAxesCombined size={21} />
          </span>
          <span className="brand">
            Price<span>Tracker</span>
          </span>
          </ExitDemoButton>
        ) : (
          <Link href="/" className="brand-link" aria-label="PriceTracker home">
          <span className="brand-mark" aria-hidden="true">
            <ChartNoAxesCombined size={21} />
          </span>
          <p className="brand">
            Price<span>Tracker</span>
          </p>
          </Link>
        )}
        <div className="topbar-actions">
          {viewer?.isDemo ? null : viewer ? (
            <Link className="button topbar-manage" href="/manage">
              <Settings2 size={16} aria-hidden="true" />
              Manage
            </Link>
          ) : (
            <Link className="button topbar-signin" href="/login">
              Sign in
            </Link>
          )}
          <ThemeToggle />
          {viewer ? <NotificationsBell /> : null}
          {viewer?.isAdmin ? <RefreshButton /> : null}
          {viewer ? (
            <AccountMenu
              username={viewer.username}
              displayName={viewer.displayName}
              publicSlug={viewer.watchlistPublic ? viewer.publicSlug : null}
              hideSettings={viewer.isDemo}
            />
          ) : null}
        </div>
      </div>
      {viewer?.isDemo ? (
        <div className="demo-banner" role="status">
          <span className="demo-banner-text">You&rsquo;re looking at a sample watchlist.</span>
          <span className="demo-banner-actions">
            <Link className="demo-banner-cta" href="/register">Make my own list</Link>
            <ExitDemoButton />
          </span>
        </div>
      ) : null}
    </header>
  );
}
