import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { isDemoSessionExpired } from '@/lib/demoSession';
import { getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/config';

export async function middleware(request: NextRequest) {
  // Drop anything the browser sent. Only this middleware may set these.
  request.headers.delete('x-pt-auth');
  request.headers.delete('x-pt-auth-ms');
  request.headers.delete('x-pt-req');
  request.headers.set('x-pt-req', crypto.randomUUID());

  const authStarted = Date.now();
  let response = NextResponse.next({ request });

  // Sign-in creates the session. Checking it first is an extra trip to the
  // auth server before the password check, and it is not used.
  const signingIn = request.method === 'POST' && request.nextUrl.pathname === '/api/auth/login';
  let userId: string | null = null;

  if (!signingIn) {
    const supabase = createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
      cookies: {
        encode: 'tokens-only',
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
          Object.entries(headers).forEach(([name, value]) => {
            response.headers.set(name, value);
          });
        }
      }
    });

    try {
      const { data } = await supabase.auth.getClaims();
      userId = typeof data?.claims?.sub === 'string' ? data.claims.sub : null;
      // Demo sessions last 1 hour from the demo sign-in. After that, sign out
      // locally: setAll above clears the auth cookies on both the request (so this
      // render already sees a signed-out visitor, e.g. / shows the landing page)
      // and the response.
      if (isDemoSessionExpired(data?.claims)) {
        await supabase.auth.signOut({ scope: 'local' });
        response.headers.set('X-Demo-Session', 'expired');
        userId = null;
      }
    } catch (error) {
      console.error('[auth] session check failed:', error instanceof Error ? error.message : error);
      userId = null;
    }
  }

  const authMs = Date.now() - authStarted;
  request.headers.set('x-pt-auth', userId ?? 'anon');
  request.headers.set('x-pt-auth-ms', String(authMs));

  // Rebuild so the page sees the marker. Copy cookies set while checking the session.
  const forwarded = NextResponse.next({ request });
  response.cookies.getAll().forEach((cookie) => {
    forwarded.cookies.set(cookie);
  });
  const demoHeader = response.headers.get('X-Demo-Session');
  if (demoHeader) forwarded.headers.set('X-Demo-Session', demoHeader);

  const privateCachedGet =
    request.method === 'GET' &&
    (/^\/api\/products\/[^/]+\/price-insight\/?$/.test(request.nextUrl.pathname) ||
      /^\/api\/overview\/?$/.test(request.nextUrl.pathname));
  forwarded.headers.set('Cache-Control', privateCachedGet ? 'private, max-age=60' : 'private, no-store');
  return forwarded;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-touch-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  ]
};
