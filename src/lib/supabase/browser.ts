'use client';

import { createBrowserClient } from '@supabase/ssr';

import { getSupabasePublishableKey, getSupabaseUrl } from './config';

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createBrowserSupabaseClient() {
  browserClient ??= createBrowserClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    { cookies: { encode: 'tokens-only' } }
  );
  return browserClient;
}
