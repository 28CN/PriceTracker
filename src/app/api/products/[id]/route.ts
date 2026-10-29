import { NextResponse } from 'next/server';

import { getWritableApiAuth } from '@/lib/demoGuard';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const guard = await getWritableApiAuth();
    if (!guard.ok) return guard.response;
    const auth = guard.auth;
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      targetPrice?: string | number | null;
      imageUrl?: string | null;
    };

    const patch: Record<string, unknown> = {};

    if (body.imageUrl !== undefined) {
      const raw = body.imageUrl === null ? '' : String(body.imageUrl).trim();
      if (raw) {
        let parsed: URL | null = null;
        try {
          parsed = new URL(raw);
        } catch {
          parsed = null;
        }
        if (!parsed || parsed.protocol !== 'https:') {
          return NextResponse.json({ error: 'Image must be an https:// URL.' }, { status: 400 });
        }
      }
      patch.image_url = raw || null;
    }

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

    const { error } = await auth.supabase
      .from('products')
      .update(patch)
      .eq('id', id)
      .eq('owner_id', auth.userId);

    if (error) {
      if (/image_url/.test(error.message) && /does not exist|42703|schema cache/.test(error.message)) {
        return NextResponse.json(
          { error: 'Apply supabase/migrations first: products.image_url is missing.' },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
