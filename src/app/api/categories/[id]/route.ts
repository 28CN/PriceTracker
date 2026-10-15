import { NextResponse } from 'next/server';

import { getApiAuth } from '@/lib/auth';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await getApiAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (typeof body?.isPublic !== 'boolean') {
    return NextResponse.json({ error: 'Choose public or private.' }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from('categories')
    .update({ is_public: body.isPublic })
    .eq('id', id)
    .eq('owner_id', auth.userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
