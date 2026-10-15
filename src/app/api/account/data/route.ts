import { NextRequest, NextResponse } from 'next/server';

import { assertSameOrigin, getApiAuth } from '@/lib/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export async function DELETE(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const auth = await getApiAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const scope = body?.scope;
  if (scope !== 'watchlist' && scope !== 'price-history') {
    return NextResponse.json({ error: 'Invalid data selection.' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data: products, error: productError } = await admin
    .from('products')
    .select('id')
    .eq('owner_id', auth.userId);
  if (productError) {
    return NextResponse.json({ error: productError.message }, { status: 500 });
  }

  const productIds = (products || []).map((product) => product.id);
  if (scope === 'watchlist') {
    const { error } = await admin.from('products').delete().eq('owner_id', auth.userId);
    if (!error) {
      await admin.from('categories').delete().eq('owner_id', auth.userId);
    }
    return error
      ? NextResponse.json({ error: error.message }, { status: 500 })
      : NextResponse.json({ ok: true });
  }

  if (productIds.length > 0) {
    const { data: links, error: linkError } = await admin
      .from('tracked_links')
      .select('id')
      .in('product_id', productIds);
    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }
    const linkIds = (links || []).map((link) => link.id);
    if (linkIds.length > 0) {
      const { error } = await admin.from('price_history').delete().in('link_id', linkIds);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
