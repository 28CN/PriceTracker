import { NextResponse } from 'next/server';

import { getApiAuth } from '@/lib/auth';
import { CATEGORY_LAYOUT_KEY, fetchCategoryLayout, parseCategoryLayout } from '@/lib/categoryLayout';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await getApiAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    }
    const layout = await fetchCategoryLayout(auth.supabase, auth.userId);
    return NextResponse.json({ layout });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await getApiAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    }
    const body = await request.json().catch(() => null);
    const layout = parseCategoryLayout(body);
    if (!layout) {
      return NextResponse.json({ error: 'Invalid layout.' }, { status: 400 });
    }

    const { error } = await auth.supabase
      .from('user_preferences')
      .upsert({
        user_id: auth.userId,
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
