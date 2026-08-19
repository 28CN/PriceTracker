import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Next.js stores server-side fetch results in Vercel's Data Cache, which
// survives redeploys. Without this every query keeps answering from whichever
// snapshot happened to populate the cache first, so newly crawled prices never
// appear no matter how often the project is redeployed.
const uncachedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store' });

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: uncachedFetch }
} as const;

// Read-only client for server rendering.  Uses the service-role key so that
// RLS does not silently hide rows.  This file is never bundled for the browser
// (it is only imported by server components and route handlers).
export function getReadClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return createClient(url, key, clientOptions);
}

// Write client for route handlers only. The secret key bypasses RLS, so this
// must never be imported into a component that runs in the browser.
export function getWriteClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  return createClient(url, requireEnv('SUPABASE_SERVICE_ROLE_KEY'), clientOptions);
}
