import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { isDemoSessionExpired } from '@/lib/demoSession';
import { getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/config';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
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
    }
  );

  const { data } = await supabase.auth.getClaims();
  // Demo sessions last 1 hour from the demo sign-in. After that, sign out
  // locally: setAll above clears the auth cookies on both the request (so this
  // render already sees a signed-out visitor, e.g. / shows the landing page)
  // and the response.
  if (isDemoSessionExpired(data?.claims)) {
    await supabase.auth.signOut({ scope: 'local' });
    response.headers.set('X-Demo-Session', 'expired');
  }
  // Chart JSON is still private to this browser. A minute of reuse avoids
  // hitting the database again when the same person reopens a card.
  // It is not a shared cache: no public or s-maxage directive.
  const chartGet =
    request.method === 'GET' &&
    /^\/api\/products\/[^/]+\/price-insight\/?$/.test(request.nextUrl.pathname);
  response.headers.set('Cache-Control', chartGet ? 'private, max-age=60' : 'private, no-store');
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-touch-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  ]
};
