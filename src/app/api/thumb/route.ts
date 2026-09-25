import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

import { getReadClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 8 * 1024 * 1024;

function isPublicHttps(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const linkId = request.nextUrl.searchParams.get('link') || '';
  if (!/^[0-9a-f-]{36}$/i.test(linkId)) {
    return new NextResponse('Bad request', { status: 400 });
  }

  const supabase = getReadClient();
  const { data, error } = await supabase
    .from('tracked_links')
    .select('image_url')
    .eq('id', linkId)
    .maybeSingle();

  if (error || !data?.image_url || !isPublicHttps(data.image_url)) {
    return new NextResponse('Not found', { status: 404 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(data.image_url, {
      headers: {
        Accept: 'image/png,image/webp,image/jpeg,image/*;q=0.8,*/*;q=0.5',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept-Language': 'en-AU,en;q=0.9'
      },
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000)
    });
  } catch {
    // Vercel often cannot reach Big W / Woolworths CDNs; the shopper's browser can.
    return NextResponse.redirect(data.image_url, 302);
  }

  if (!upstream.ok) {
    return NextResponse.redirect(data.image_url, 302);
  }

  const length = Number(upstream.headers.get('content-length') || 0);
  if (length > MAX_BYTES) {
    return new NextResponse('Image too large', { status: 413 });
  }

  const input = Buffer.from(await upstream.arrayBuffer());
  if (input.length === 0 || input.length > MAX_BYTES) {
    return new NextResponse('Image too large', { status: 413 });
  }

  let output: Buffer;
  try {
    output = await sharp(input, { animated: false })
      .rotate()
      .ensureAlpha()
      .trim({ threshold: 18 })
      .resize(320, 320, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch {
    try {
      output = await sharp(input, { animated: false })
        .rotate()
        .resize(320, 320, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
    } catch {
      return new NextResponse('Could not read image', { status: 422 });
    }
  }

  return new NextResponse(new Uint8Array(output), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800'
    }
  });
}
