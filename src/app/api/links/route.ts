import { NextResponse } from 'next/server';

import { detectRetailer, isValidHttpUrl } from '@/lib/retailer';
import { getWriteClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      productId?: string;
      links?: Array<{ url?: string; retailer?: string }>;
    };

    const productId = (body.productId || '').trim();
    if (!productId) {
      return NextResponse.json({ error: 'Product is required.' }, { status: 400 });
    }

    const cleanedLinks = (body.links || [])
      .map((link) => ({
        url: (link.url || '').trim(),
        retailer: (link.retailer || '').trim()
      }))
      .filter((link) => link.url.length > 0);

    if (cleanedLinks.length === 0) {
      return NextResponse.json({ error: 'Add at least one link.' }, { status: 400 });
    }

    const invalid = cleanedLinks.find((link) => !isValidHttpUrl(link.url));
    if (invalid) {
      return NextResponse.json({ error: `Not a valid link: ${invalid.url}` }, { status: 400 });
    }

    const supabase = getWriteClient();

    const rows = cleanedLinks.map((link) => ({
      product_id: productId,
      url: link.url,
      retailer: link.retailer || detectRetailer(link.url) || 'Unknown shop',
      is_active: true
    }));

    const { error } = await supabase.from('tracked_links').insert(rows);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, added: rows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
