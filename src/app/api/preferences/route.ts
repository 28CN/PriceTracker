import { NextResponse } from 'next/server';

import { CATEGORY_LAYOUT_KEY, fetchCategoryLayout, parseCategoryLayout } from '@/lib/categoryLayout';
import { getReadClient, getWriteClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const layout = await fetchCategoryLayout(getReadClient());
    return NextResponse.json({ layout });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const layout = parseCategoryLayout(body);
    if (!layout) {
      return NextResponse.json({ error: 'Invalid layout.' }, { status: 400 });
    }

    const { error } = await getWriteClient()
      .from('app_settings')
      .upsert({
        key: CATEGORY_LAYOUT_KEY,
        value: layout,
        updated_at: new Date().toISOString()
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
