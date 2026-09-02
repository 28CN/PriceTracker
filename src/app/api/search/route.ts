import { NextResponse } from 'next/server';

import { findSearchRetailer, searchRetailer } from '@/lib/shopSearch';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') || '').trim();
  const retailer = (searchParams.get('retailer') || '').trim().toLowerCase();

  if (query.length < 2) {
    return NextResponse.json({ error: 'Type at least 2 characters.' }, { status: 400 });
  }

  if (!findSearchRetailer(retailer)) {
    return NextResponse.json({ error: 'Unknown shop.' }, { status: 400 });
  }

  try {
    const result = await searchRetailer(retailer, query);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
