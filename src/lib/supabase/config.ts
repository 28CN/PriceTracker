export function getSupabaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!value) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  }
  return value;
}

export function getSupabasePublishableKey(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return value;
}

export function getSupabaseSecretKey(): string {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  }
  return value;
}
