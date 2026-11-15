import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { cookieFingerprint, inflight } from '@/lib/inflight';

import { getSupabasePublishableKey, getSupabaseUrl } from './config';

type ServerClient = ReturnType<typeof createServerClient>;

// Holds the promise only until it settles. See inflight.
const clientPromises = new Map<string, Promise<ServerClient>>();

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const key = cookieFingerprint(cookieStore.getAll());
  return inflight(clientPromises, key, async () =>
    createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
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
    })
  );
}
