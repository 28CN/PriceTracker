import { NextResponse } from 'next/server';

import { getWriteClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { name?: string };
    const name = (body.name || '').trim();

    if (!name) {
      return NextResponse.json({ error: 'Category name is required.' }, { status: 400 });
    }

    const supabase = getWriteClient();

    const { data: existing } = await supabase
      .from('categories')
      .select('id, name')
      .ilike('name', name)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ category: existing, created: false });
    }

    const { data, error } = await supabase
      .from('categories')
      .insert({ name })
      .select('id, name')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ category: data, created: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
