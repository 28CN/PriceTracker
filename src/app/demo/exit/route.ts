import { NextRequest, NextResponse } from 'next/server';

import { assertSameOrigin } from '@/lib/auth';
import { isSupabaseAuthCookie } from '@/lib/demoSession';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** GET never signs anyone out (logout CSRF); it just goes to the landing page. */
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/', request.url), 303);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/**
 * Exit the demo (also fine for any signed-in user): sign out this session,
 * clear every Supabase auth cookie, and 303 to the landing page.
 * Use from a <form method="post" action="/demo/exit">. Rejects cross-origin posts.
 */
export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut({ scope: 'local' });
  } catch (error) {
    console.error('[demo] exit sign-out failed:', error instanceof Error ? error.message : error);
  }
  const response = NextResponse.redirect(new URL('/', request.url), 303);
  for (const { name } of request.cookies.getAll()) {
    if (isSupabaseAuthCookie(name)) response.cookies.set(name, '', { path: '/', maxAge: 0 });
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
