import { NextResponse } from 'next/server';

import { getApiAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const auth = await getApiAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    }
    const body = (await request.json().catch(() => ({}))) as { name?: string };
    const name = (body.name || '').trim();

    if (!name) {
      return NextResponse.json({ error: 'Category name is required.' }, { status: 400 });
    }

    const { supabase, userId } = auth;

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
      .insert({ name, owner_id: userId })
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
