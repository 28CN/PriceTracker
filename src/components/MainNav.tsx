'use client';

import { BookOpen, Download, House, LayoutDashboard, PackagePlus, Scale, Tag, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { navItemsFor, isNavItemActive, type NavItemKey } from '@/lib/navItems';
import { useForYou } from '@/lib/useForYou';

const ICONS: Record<NavItemKey, LucideIcon> = {
  home: House,
  dashboard: LayoutDashboard,
  add: PackagePlus,
  compare: Scale,
  deals: Tag,
  about: BookOpen,
  install: Download
};

/**
 * Main pages. Rendered twice: inline in the top bar on wide screens and as a
 * bottom tab bar on phones. CSS shows one; the hidden one is display:none, so
 * screen readers only meet one "Main" navigation.
 */
export default function MainNav({
  signedIn,
  placement
}: {
  signedIn: boolean;
  placement: 'top' | 'bottom';
}) {
  const pathname = usePathname() || '/';
  const items = navItemsFor(signedIn).filter((item) => placement === 'top' || item.onPhone !== false);
  const forYou = useForYou(signedIn);
  const newDeals = forYou?.count ?? 0;

  return (
    <nav className={`main-nav main-nav-${placement}`} aria-label="Main">
      <ul>
        {items.map((item) => {
          const Icon = ICONS[item.key];
          const active = isNavItemActive(item, pathname);
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                className={`main-nav-link${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <span className="main-nav-icon">
                  <Icon size={placement === 'bottom' ? 20 : 16} aria-hidden="true" />
                  {item.key === 'deals' && newDeals > 0 ? (
                    <span className="main-nav-badge" aria-hidden="true">
                      {newDeals > 9 ? '9+' : newDeals}
                    </span>
                  ) : null}
                </span>
                <span>{item.label}</span>
                {item.key === 'deals' && newDeals > 0 ? <span className="sr-only">, {newDeals} new for you</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
