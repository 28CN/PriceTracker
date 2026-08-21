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
    const { error } = await supabase.from('tracked_links').update(patch).eq('id', params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
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
