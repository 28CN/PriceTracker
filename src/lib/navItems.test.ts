import { describe, expect, it } from 'vitest';

import { isNavItemActive, navItemsFor } from './navItems';

describe('navItemsFor', () => {
  it('shows visitors only public pages', () => {
    expect(navItemsFor(false).map((item) => item.href)).toEqual(['/', '/about']);
  });

  it('shows signed-in people their pages, at most four for the phone bar', () => {
    const items = navItemsFor(true);
    expect(items.map((item) => item.label)).toEqual(['Dashboard', 'Add', 'About']);
    expect(items.length).toBeLessThanOrEqual(4);
  });
});

describe('isNavItemActive', () => {
  const [dashboard, add, about] = navItemsFor(true);

  it('marks Dashboard only on the home page', () => {
    expect(isNavItemActive(dashboard, '/')).toBe(true);
    expect(isNavItemActive(dashboard, '/about')).toBe(false);
  });

  it('marks Add on /add and /manage, not on look-alike paths', () => {
    expect(isNavItemActive(add, '/add')).toBe(true);
    expect(isNavItemActive(add, '/manage')).toBe(true);
    expect(isNavItemActive(add, '/address')).toBe(false);
    expect(isNavItemActive(about, '/about')).toBe(true);
  });
});
