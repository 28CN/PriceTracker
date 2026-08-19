import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Read-only client for server rendering.  Uses the service-role key so that
// RLS does not silently hide rows.  This file is never bundled for the browser
// (it is only imported by server components and route handlers).
export function getReadClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

// Write client for route handlers only. The secret key bypasses RLS, so this
// must never be imported into a component that runs in the browser.
export function getWriteClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  return createClient(url, requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
