import { NextResponse } from 'next/server';

import { getWriteClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type RouteContext = { params: { id: string } };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      targetPrice?: string | number | null;
    };

    const patch: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) {
        return NextResponse.json({ error: 'Product name is required.' }, { status: 400 });
      }
      patch.name = name;
    }

    if (body.targetPrice !== undefined) {
      const raw = body.targetPrice;
      const targetPrice =
        raw === null || raw === '' ? null : Number(raw);

      if (targetPrice !== null && !Number.isFinite(targetPrice)) {
        return NextResponse.json({ error: 'Target price must be a number.' }, { status: 400 });
      }
      if (targetPrice !== null && targetPrice < 0) {
        return NextResponse.json({ error: 'Target price cannot be negative.' }, { status: 400 });
      }
      patch.target_price = targetPrice;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    const supabase = getWriteClient();
    const { error } = await supabase.from('products').update(patch).eq('id', params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
