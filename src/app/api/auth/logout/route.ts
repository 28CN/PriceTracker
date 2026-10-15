import { NextRequest, NextResponse } from 'next/server';

import { assertSameOrigin } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  return NextResponse.json(
    { ok: true },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
