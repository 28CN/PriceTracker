/**
 * Pure pieces of the /demo sign-in flow, kept free of Next/Supabase imports so
 * they can be unit-tested under node --test.
 */

type HeaderLike = { get(name: string): string | null };

/**
 * Login-CSRF guard for POST /demo. Stricter than assertSameOrigin(): a request
 * without an Origin header is only accepted when the browser marks it same-origin.
 */
export function isSameSiteDemoRequest(headers: HeaderLike, requestUrl: string): boolean {
  const origin = headers.get('origin');
  if (origin) return origin === new URL(requestUrl).origin;
  return headers.get('sec-fetch-site') === 'same-origin';
}

export type DemoSignInDeps = {
  password: string | undefined;
  sameOrigin: boolean;
  consumeRateLimit: () => Promise<boolean>;
  resetCredentials: (password: string) => Promise<boolean>;
  signIn: (password: string) => Promise<boolean>;
};

export type DemoSignInResult =
  | { status: 403 }
  | { status: 303; location: '/' | '/login?demo=unavailable' | '/login?demo=rate_limited' };

/** Order: origin, config, rate limit, credential reset, sign-in. Fails closed. */
export async function runDemoSignIn(deps: DemoSignInDeps): Promise<DemoSignInResult> {
  if (!deps.sameOrigin) return { status: 403 };
  if (!deps.password) return { status: 303, location: '/login?demo=unavailable' };
  try {
    if (!(await deps.consumeRateLimit())) {
      return { status: 303, location: '/login?demo=rate_limited' };
    }
    if (!(await deps.resetCredentials(deps.password))) {
      return { status: 303, location: '/login?demo=unavailable' };
    }
    if (!(await deps.signIn(deps.password))) {
      return { status: 303, location: '/login?demo=unavailable' };
    }
  } catch (error) {
    console.error('[demo] sign-in flow failed:', error instanceof Error ? error.message : error);
    return { status: 303, location: '/login?demo=unavailable' };
  }
  return { status: 303, location: '/' };
}
