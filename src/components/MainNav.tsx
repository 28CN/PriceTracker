'use client';

import { BookOpen, House, LayoutDashboard, PackagePlus, Scale, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { navItemsFor, isNavItemActive, type NavItemKey } from '@/lib/navItems';

const ICONS: Record<NavItemKey, LucideIcon> = {
  home: House,
  dashboard: LayoutDashboard,
  add: PackagePlus,
  compare: Scale,
  about: BookOpen
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
  const items = navItemsFor(signedIn);

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
                <Icon size={placement === 'bottom' ? 20 : 16} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
