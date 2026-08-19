import { NextResponse } from 'next/server';

import { getReadClient, getWriteClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = getReadClient();
    const { data, error } = await supabase
      .from('crawl_events')
      .select('id, level, message, is_read, created_at')
      .order('created_at', { ascending: false })
      .limit(40);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const events = (data || []).map((row) => ({
      id: row.id as string,
      level: (row.level as string) || 'info',
      message: (row.message as string) || '',
      isRead: Boolean(row.is_read),
      createdAt: row.created_at as string
    }));

    return NextResponse.json({
      events,
      unread: events.filter((event) => !event.isRead).length
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const supabase = getWriteClient();
    const { error } = await supabase
      .from('crawl_events')
      .update({ is_read: true })
      .eq('is_read', false);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
