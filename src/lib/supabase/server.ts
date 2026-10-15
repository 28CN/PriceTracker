import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { getSupabasePublishableKey, getSupabaseUrl } from './config';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      encode: 'tokens-only',
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies. Middleware refreshes them.
        }
      }
    }
  });
}
