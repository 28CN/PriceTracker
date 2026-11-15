import { createHash } from 'node:crypto';

/**
 * Share one in-flight promise for the same key, then forget it.
 * This is not a cache: nothing is kept after the promise settles, so a later
 * request cannot reuse another person's result. Same-request callers (the
 * top bar and the page) that start together do share one read.
 */
export function inflight<T>(bucket: Map<string, Promise<T>>, key: string, run: () => Promise<T>): Promise<T> {
  const existing = bucket.get(key);
  if (existing) return existing;
  const pending = run().finally(() => {
    if (bucket.get(key) === pending) bucket.delete(key);
  });
  bucket.set(key, pending);
  return pending;
}

export function cookieFingerprint(cookies: { name: string; value: string }[]): string {
  const raw = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('\n');
  return createHash('sha256').update(raw).digest('hex');
}
