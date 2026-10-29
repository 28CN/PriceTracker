import { NextResponse } from 'next/server.js';

/** Fixed id and login of the seeded read-only demo account (see migration 202610290002). */
export const DEMO_USER_ID = 'd3300000-0000-4000-8000-00000000de30';
export const DEMO_AUTH_EMAIL = 'demo@users.invalid';
export const DEMO_READ_ONLY_MESSAGE = 'The demo account is read-only. Create a free account to make changes.';

export type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => PromiseLike<{ data: { is_demo?: boolean | null } | null; error: unknown }>;
      };
    };
  };
};

/** True when the profile row for userId is flagged is_demo. Fails closed on lookup errors. */
export async function isDemoUser(supabase: SupabaseLike, userId: string): Promise<boolean> {
  if (userId === DEMO_USER_ID) return true;
  const { data, error } = await supabase
    .from('profiles')
    .select('is_demo')
    .eq('id', userId)
    .maybeSingle();
  if (error) return true;
  return data?.is_demo === true;
}

export function demoReadOnlyResponse() {
  return NextResponse.json(
    { error: DEMO_READ_ONLY_MESSAGE, code: 'demo_read_only' },
    { status: 403, headers: { 'Cache-Control': 'private, no-store' } }
  );
}
