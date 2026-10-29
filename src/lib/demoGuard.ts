import { NextResponse } from 'next/server';

import { getApiAuth } from './auth';
import { demoReadOnlyResponse, isDemoUser, type SupabaseLike } from './demo';

/**
 * Shared guard for every write API route: returns the auth context, or a ready
 * NextResponse (401 when signed out, 403 for the read-only demo account).
 */
export async function getWritableApiAuth(): Promise<
  | { ok: true; auth: NonNullable<Awaited<ReturnType<typeof getApiAuth>>> }
  | { ok: false; response: NextResponse }
> {
  const auth = await getApiAuth();
  if (!auth) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
    };
  }
  if (await isDemoUser(auth.supabase as unknown as SupabaseLike, auth.userId)) {
    return { ok: false, response: demoReadOnlyResponse() };
  }
  return { ok: true, auth };
}
