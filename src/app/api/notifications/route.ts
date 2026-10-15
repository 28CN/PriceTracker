import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { getApiAuth } from '@/lib/auth';
import { latestTimestamp } from '@/lib/format';
import { isResolved, isStaleNoise, needsAction, type LinkHealth } from '@/lib/notices';
import type { CrawlEventView } from '@/lib/types';

export const dynamic = 'force-dynamic';

const LINK_HEALTH_SELECTS = ['id, is_active, stock_checked_at', 'id, is_active'] as const;
const HEALTH_SCAN_LIMIT = 1000;

type LinkRow = { id: string; is_active: boolean | null; stock_checked_at?: string | null };
type StampRow = { link_id: string | null; created_at: string };

async function fetchLinkRows(supabase: SupabaseClient, linkIds: string[]): Promise<LinkRow[] | null> {
  for (const columns of LINK_HEALTH_SELECTS) {
    const { data, error } = await supabase.from('tracked_links').select(columns).in('id', linkIds);
    if (!error) {
      return (data || []) as unknown as LinkRow[];
    }
    if (!/does not exist|42703/.test(error.message)) {
      break;
    }
  }
  return null;
}

/** Newest moment each link was parsed successfully: a saved price or a confirmed "unavailable". */
async function fetchLastParsed(
  supabase: SupabaseClient,
  linkIds: string[]
): Promise<Map<string, string>> {
  const [prices, unavailable] = await Promise.all([
    supabase
      .from('price_history')
      .select('link_id, created_at')
      .in('link_id', linkIds)
      .order('created_at', { ascending: false })
      .limit(HEALTH_SCAN_LIMIT),
    supabase
      .from('crawl_events')
      .select('link_id, created_at')
      .in('link_id', linkIds)
      .ilike('message', '%currently unavailable%')
      .order('created_at', { ascending: false })
      .limit(HEALTH_SCAN_LIMIT)
  ]);

  const newest = new Map<string, string>();
  for (const rows of [prices.data, unavailable.data]) {
    for (const row of (rows || []) as StampRow[]) {
      if (row.link_id) {
        newest.set(row.link_id, latestTimestamp([newest.get(row.link_id) ?? null, row.created_at])!);
      }
    }
  }
  return newest;
}

async function fetchLinkHealth(
  supabase: SupabaseClient,
  linkIds: string[]
): Promise<Map<string, LinkHealth> | null> {
  if (linkIds.length === 0) {
    return new Map();
  }
  const [rows, lastParsed] = await Promise.all([
    fetchLinkRows(supabase, linkIds),
    fetchLastParsed(supabase, linkIds)
  ]);
  if (!rows) {
    return null;
  }
  return new Map(
    rows.map((row) => [
      row.id,
      {
        isActive: row.is_active !== false,
        checkedAt: latestTimestamp([row.stock_checked_at ?? null, lastParsed.get(row.id) ?? null])
      }
    ])
  );
}

export async function GET() {
  try {
    const auth = await getApiAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    }
    const { supabase } = auth;
    const { data, error } = await supabase
      .from('crawl_events')
      .select('id, link_id, level, message, is_read, created_at')
      .order('created_at', { ascending: false })
      .limit(80);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const events: CrawlEventView[] = (data || []).map((row) => ({
      id: row.id as string,
      linkId: (row.link_id as string | null) ?? null,
      level: (row.level as string) || 'info',
      message: (row.message as string) || '',
      isRead: Boolean(row.is_read),
      createdAt: row.created_at as string
    }));

    const actionableLinkIds = [
      ...new Set(events.filter(needsAction).map((event) => event.linkId as string))
    ];
    const links = await fetchLinkHealth(supabase, actionableLinkIds);

    const now = Date.now();
    const autoRead: string[] = [];
    for (const event of events) {
      event.resolved = isResolved(event, links);
      if (!event.isRead && (event.resolved || isStaleNoise(event, now))) {
        event.isRead = true;
        autoRead.push(event.id);
      }
    }

    if (autoRead.length > 0) {
      const { error: markError } = await supabase
        .from('crawl_events')
        .update({ is_read: true })
        .in('id', autoRead);
      if (markError) {
        console.error('[notifications] could not auto-mark read:', markError.message);
      }
    }

    return NextResponse.json({
      events,
      unread: events.filter((event) => !event.isRead).length
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getApiAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    }
    const { supabase } = auth;
    let body: { id?: string; ids?: string[] } = {};
    try {
      body = (await request.json()) as { id?: string; ids?: string[] };
    } catch {
      body = {};
    }

    const ids = [
      ...(typeof body.id === 'string' && body.id ? [body.id] : []),
      ...((Array.isArray(body.ids) ? body.ids : []).filter(
        (value): value is string => typeof value === 'string' && Boolean(value)
      ))
    ];

    let query = supabase.from('crawl_events').update({ is_read: true }).eq('is_read', false);
    if (ids.length === 1) {
      query = query.eq('id', ids[0]);
    } else if (ids.length > 1) {
      query = query.in('id', ids);
    }

    const { error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
