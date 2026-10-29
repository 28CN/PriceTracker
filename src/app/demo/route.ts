import { NextRequest, NextResponse } from 'next/server';

import { consumeAuthRateLimit } from '@/lib/auth';
import { DEMO_AUTH_EMAIL } from '@/lib/demo';
import { isSameSiteDemoRequest, runDemoSignIn } from '@/lib/demoFlow';
import { resetDemoCredentials } from '@/lib/demoReset';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const DEMO_ATTEMPTS_PER_WINDOW = 20; // per IP, 15-minute window (see consumeAuthRateLimit)

/** GET never signs anyone in (login CSRF); it just sends people to the page with the demo button. */
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/', request.url), 303);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/**
 * One-click sign-in to the read-only demo account. The password lives only in
 * the DEMO_ACCOUNT_PASSWORD server env var; it is never sent to the browser.
 */
export async function POST(request: NextRequest) {
  const result = await runDemoSignIn({
    password: process.env.DEMO_ACCOUNT_PASSWORD,
    sameOrigin: isSameSiteDemoRequest(request.headers, request.url),
    consumeRateLimit: () => consumeAuthRateLimit(request, 'demo', 'demo', DEMO_ATTEMPTS_PER_WINDOW),
    // A demo session can call auth.updateUser() to change the password or email.
    // Restore both with the service-role admin API before every sign-in.
    resetCredentials: (password) => {
      let admin = null;
      try {
        admin = createAdminSupabaseClient();
      } catch (error) {
        console.error('[demo] admin client unavailable:', error instanceof Error ? error.message : error);
      }
      return resetDemoCredentials(admin, password);
    },
    signIn: async (password) => {
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({ email: DEMO_AUTH_EMAIL, password });
      if (error) console.error('[demo] demo sign-in failed:', error.message);
      return !error;
    }
  });

  if (result.status === 403) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  if (result.location === '/login?demo=rate_limited') console.warn('[demo] rate limited');
  const response = NextResponse.redirect(new URL(result.location, request.url), 303);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
