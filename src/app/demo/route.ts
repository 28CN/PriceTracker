import { NextRequest, NextResponse } from 'next/server';

import { DEMO_AUTH_EMAIL } from '@/lib/demo';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * One-click sign-in to the read-only demo account. The password lives only in
 * the DEMO_ACCOUNT_PASSWORD server env var; it is never sent to the browser.
 */
export async function GET(request: NextRequest) {
  const password = process.env.DEMO_ACCOUNT_PASSWORD;
  const home = new URL('/', request.url);
  if (!password) {
    console.error('[demo] DEMO_ACCOUNT_PASSWORD is not configured');
    return NextResponse.redirect(new URL('/login?demo=unavailable', request.url), 303);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: DEMO_AUTH_EMAIL,
    password
  });
  if (error) {
    console.error('[demo] demo sign-in failed:', error.message);
    return NextResponse.redirect(new URL('/login?demo=unavailable', request.url), 303);
  }

  const response = NextResponse.redirect(home, 303);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
