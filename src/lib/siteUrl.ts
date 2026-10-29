/**
 * Single source of truth for the public site URL.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL (preferred, set on Vercel and in .env.local)
 *   2. NEXT_PUBLIC_APP_URL / APP_URL (legacy names, kept so existing deployments keep working)
 *   3. Production (VERCEL_ENV=production): VERCEL_PROJECT_PRODUCTION_URL (stable prod domain)
 *      Preview/other: VERCEL_URL (per-deployment host)
 *   4. http://localhost:3000
 * Warns once when VERCEL_ENV=production and NEXT_PUBLIC_SITE_URL is unset.
 * The returned value never has a trailing slash.
 */
let warned = false;
function warnMissingSiteUrl() {
  if (warned) return;
  warned = true;
  console.warn(
    '\n⚠️  [siteUrl] VERCEL_ENV=production but NEXT_PUBLIC_SITE_URL is not set. ' +
      'Falling back; email links may point to the wrong domain. Set NEXT_PUBLIC_SITE_URL on Vercel.\n',
  );
}

export function getSiteUrl(env: Record<string, string | undefined> = process.env): string {
  const explicit =
    env.NEXT_PUBLIC_SITE_URL?.trim() || env.NEXT_PUBLIC_APP_URL?.trim() || env.APP_URL?.trim();
  let url = explicit || '';
  const isProd = env.VERCEL_ENV === 'production';
  if (isProd && !env.NEXT_PUBLIC_SITE_URL?.trim()) warnMissingSiteUrl();
  if (!url) {
    const vercel = (isProd ? env.VERCEL_PROJECT_PRODUCTION_URL?.trim() : '') || env.VERCEL_URL?.trim();
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
