import { NextResponse } from 'next/server';

import { getApiAuth } from '@/lib/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// Recent crawler notices. Administrators only; the service role sees run
// summaries that are not tied to one link. Local agents should use `npm run logs`.
export async function GET(request: Request) {
  const auth = await getApiAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }
  if (!auth.isAdmin) {
    return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  }

  const requested = Number(new URL(request.url).searchParams.get('limit') || 80);
  const limit = Number.isFinite(requested) ? Math.min(200, Math.max(1, Math.floor(requested))) : 80;
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from('crawl_events')
    .select('id, link_id, level, message, is_read, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    events: (data || []).map((row) => ({
      id: row.id,
      linkId: row.link_id,
      level: row.level,
      message: row.message,
      isRead: row.is_read,
      createdAt: row.created_at
    }))
  });
}
