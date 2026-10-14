import { NextResponse } from 'next/server';

import { detectRetailer, isValidHttpUrl } from '@/lib/retailer';
import { getWriteClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type RouteContext = { params: { id: string } };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      isActive?: boolean;
      url?: string;
      retailer?: string;
    };

    const patch: Record<string, unknown> = {};

    if (typeof body.isActive === 'boolean') {
      patch.is_active = body.isActive;
    }

    if (body.url !== undefined) {
      const url = String(body.url).trim();
      if (!isValidHttpUrl(url)) {
        return NextResponse.json({ error: `Not a valid link: ${url}` }, { status: 400 });
      }
      patch.url = url;
      if (body.retailer === undefined) {
        patch.retailer = detectRetailer(url) || 'Unknown shop';
      }
    }

    if (body.retailer !== undefined) {
      const retailer = String(body.retailer).trim();
      patch.retailer = retailer || 'Unknown shop';
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    const supabase = getWriteClient();
    const { data: before } = await supabase
      .from('tracked_links')
      .select('url, is_active')
      .eq('id', params.id)
      .maybeSingle();

    const { error } = await supabase.from('tracked_links').update(patch).eq('id', params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // A replaced or disabled link makes its old problem notices moot.
    const urlChanged = typeof patch.url === 'string' && before && patch.url !== before.url;
    const disabled = patch.is_active === false && before?.is_active !== false;
    if (urlChanged || disabled) {
      const { error: noticeError } = await supabase
        .from('crawl_events')
        .update({ is_read: true })
        .eq('link_id', params.id)
        .eq('is_read', false);
      if (noticeError) {
        console.error('[links] could not clear notices:', noticeError.message);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const supabase = getWriteClient();
    const { error } = await supabase.from('tracked_links').delete().eq('id', params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
