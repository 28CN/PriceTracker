export type NavItemKey = 'home' | 'dashboard' | 'add' | 'compare' | 'deals' | 'eat' | 'about' | 'install';

export type NavItem = {
  key: NavItemKey;
  href: string;
  label: string;
  /** Other paths that count as this page, e.g. /manage for Add. */
  alsoActiveOn?: string[];
  /** False when the phone tab bar has no room; the page stays in the top bar and menus. */
  onPhone?: boolean;
};

/** Only pages that exist. Visitors who are not signed in see Home, Deals, Guide and Install. */
export function navItemsFor(signedIn: boolean): NavItem[] {
  if (!signedIn) {
    return [
      { key: 'home', href: '/', label: 'Home' },
      { key: 'deals', href: '/deals', label: 'Deals' },
      // Top bar only; the phone bar keeps four tabs.
      { key: 'eat', href: '/eat', label: 'Eat', onPhone: false },
      { key: 'about', href: '/about', label: 'Guide' },
      { key: 'install', href: '/install', label: 'Install' }
    ];
  }
  return [
    { key: 'dashboard', href: '/', label: 'Dashboard' },
    { key: 'add', href: '/add', label: 'Add', alsoActiveOn: ['/manage'] },
    { key: 'compare', href: '/compare', label: 'Compare' },
    { key: 'deals', href: '/deals', label: 'Deals' },
    // More than four do not fit the phone bar; Eat, Guide and Install are in the account menu there.
    { key: 'eat', href: '/eat', label: 'Eat', onPhone: false },
    { key: 'about', href: '/about', label: 'Guide', onPhone: false },
    { key: 'install', href: '/install', label: 'Install', onPhone: false }
  ];
}

function matches(base: string, pathname: string): boolean {
  if (base === '/') return pathname === '/';
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return [item.href, ...(item.alsoActiveOn ?? [])].some((base) => matches(base, pathname));
}
