/**
 * Demo session lifetime. Pure (no Next/Supabase imports) so it is unit-testable.
 *
 * The age is measured from the password sign-in recorded in the JWT `amr`
 * claim. Supabase keeps that timestamp across token refreshes and it is signed,
 * so a demo visitor cannot extend the session by refreshing or editing cookies.
 */
import { DEMO_USER_ID } from './demo.ts';

export const DEMO_SESSION_MAX_AGE_SECONDS = 60 * 60; // 1 hour

type AmrEntry = { method?: unknown; timestamp?: unknown };
export type ClaimsLike = { sub?: unknown; amr?: unknown } | null | undefined;

/** Unix seconds of the demo's password sign-in, or null when the claim is missing. */
export function demoSignInTimestamp(claims: ClaimsLike): number | null {
  const amr = claims?.amr;
  if (!Array.isArray(amr)) return null;
  const stamps = (amr as AmrEntry[])
    .filter((e) => e && e.method === 'password' && typeof e.timestamp === 'number')
    .map((e) => e.timestamp as number);
  return stamps.length ? Math.max(...stamps) : null;
}

/** True for a demo session older than the limit. Fails closed if the sign-in time is unknown. */
export function isDemoSessionExpired(claims: ClaimsLike, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (claims?.sub !== DEMO_USER_ID) return false;
  const started = demoSignInTimestamp(claims);
  if (started === null) return true;
  return nowSeconds - started >= DEMO_SESSION_MAX_AGE_SECONDS;
}

/** Seconds left in a demo session (0 when expired), or null for non-demo users. */
export function demoSessionSecondsLeft(claims: ClaimsLike, nowSeconds = Math.floor(Date.now() / 1000)): number | null {
  if (claims?.sub !== DEMO_USER_ID) return null;
  const started = demoSignInTimestamp(claims);
  if (started === null) return 0;
  return Math.max(0, DEMO_SESSION_MAX_AGE_SECONDS - (nowSeconds - started));
}

/** Supabase auth cookie names (sb-<ref>-auth-token and its .0/.1 chunks). */
export function isSupabaseAuthCookie(name: string): boolean {
  return /^sb-.+-auth-token(\.\d+)?$/.test(name) || /^sb-.+-auth-token-code-verifier$/.test(name);
}
