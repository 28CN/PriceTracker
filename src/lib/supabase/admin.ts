import { createClient } from '@supabase/supabase-js';

import { getSupabaseSecretKey, getSupabaseUrl } from './config';

export function createAdminSupabaseClient() {
  return createClient(getSupabaseUrl(), getSupabaseSecretKey(), {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' })
    }
  });
}
