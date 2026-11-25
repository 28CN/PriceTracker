const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

export const RESERVED_USERNAMES = new Set([
  'about',
  'account',
  'add',
  'admin',
  'api',
  'auth',
  'compare',
  'deals',
  'demo',
  'forgot-password',
  'insights',
  'install',
  'login',
  'logout',
  'manage',
  'preview',
  'privacy',
  'register',
  'reset-password',
  'security',
  'settings',
  'signup',
  'support',
  'trip',
  'unsubscribe',
  'verify-email',
  'www'
]);

export function normalizeUsername(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function syntheticAuthEmail(username: string): string {
  return `${username}@users.invalid`;
}

export function validateUsername(username: string, allowAdmin = false): string | null {
  if (!USERNAME_PATTERN.test(username)) {
    return 'Use 3–30 lowercase letters, numbers or single hyphens.';
  }
  if (RESERVED_USERNAMES.has(username) && !(allowAdmin && username === 'admin')) {
    return 'That username is reserved.';
  }
  return null;
}
