import { NextResponse } from 'next/server';

import { brandKey } from '@/lib/dealMatch';
import { getWritableApiAuth } from '@/lib/demoGuard';

export const dynamic = 'force-dynamic';

/** Follow, mute or clear one brand: { label, state: 'follow' | 'mute' | null }. */
export async function PUT(request: Request) {
  try {
    const guard = await getWritableApiAuth();
    if (!guard.ok) return guard.response;
    const { supabase, userId } = guard.auth;
    const body = (await request.json().catch(() => null)) as { label?: unknown; state?: unknown } | null;
    const label = typeof body?.label === 'string' ? body.label.trim().slice(0, 40) : '';
    const key = label ? brandKey(label) : null;
    const state = body?.state;
    if (!key || (state !== 'follow' && state !== 'mute' && state !== null)) {
      return NextResponse.json({ error: 'Invalid brand.' }, { status: 400 });
    }

    const { error } =
      state === null
        ? await supabase.from('deal_brand_prefs').delete().eq('user_id', userId).eq('brand_key', key)
        : await supabase
            .from('deal_brand_prefs')
            .upsert({ user_id: userId, brand_key: key, label, state, updated_at: new Date().toISOString() });
    if (error) {
      const limit = /brand limit/.test(error.message);
      return NextResponse.json({ error: limit ? 'Too many brands.' : 'Could not save.' }, { status: limit ? 409 : 500 });
    }
    return NextResponse.json({ ok: true, key, state });
  } catch (error) {
    console.error('[deals] brand pref failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Could not save.' }, { status: 500 });
  }
}
