/**
 * Single source of truth for the public site URL.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL (preferred, set on Vercel and in .env.local)
 *   2. NEXT_PUBLIC_APP_URL / APP_URL (legacy names, kept so existing deployments keep working)
 *   3. VERCEL_URL (Vercel's per-deployment host, no scheme)
 *   4. http://localhost:3000
 * The returned value never has a trailing slash.
 */
export function getSiteUrl(env: Record<string, string | undefined> = process.env): string {
  const explicit =
    env.NEXT_PUBLIC_SITE_URL?.trim() || env.NEXT_PUBLIC_APP_URL?.trim() || env.APP_URL?.trim();
  let url = explicit || '';
  if (!url) {
    const vercel = env.VERCEL_URL?.trim();
    url = vercel ? `https://${vercel.replace(/^https?:\/\//, '')}` : 'http://localhost:3000';
  }
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, '');
}

/** Build an absolute URL on this site from a path such as `/verify-email?token=...`. */
export function absoluteUrl(path = '/', env?: Record<string, string | undefined>): string {
  const base = getSiteUrl(env);
  if (!path) return base;
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}
