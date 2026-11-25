export type NavItemKey = 'home' | 'dashboard' | 'add' | 'compare' | 'about';

export type NavItem = {
  key: NavItemKey;
  href: string;
  label: string;
  /** Other paths that count as this page, e.g. /manage for Add. */
  alsoActiveOn?: string[];
};

/** Only pages that exist. Visitors who are not signed in see Home and About. */
export function navItemsFor(signedIn: boolean): NavItem[] {
  if (!signedIn) {
    return [
      { key: 'home', href: '/', label: 'Home' },
      { key: 'about', href: '/about', label: 'About' }
    ];
  }
  return [
    { key: 'dashboard', href: '/', label: 'Dashboard' },
    { key: 'add', href: '/add', label: 'Add', alsoActiveOn: ['/manage'] },
    { key: 'compare', href: '/compare', label: 'Compare' },
    { key: 'about', href: '/about', label: 'About' }
  ];
}

function matches(base: string, pathname: string): boolean {
  if (base === '/') return pathname === '/';
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return [item.href, ...(item.alsoActiveOn ?? [])].some((base) => matches(base, pathname));
}
