import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

import { getReadClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 8 * 1024 * 1024;
const UUID = /^[0-9a-f-]{36}$/i;

// The `v` query param changes whenever the stored URL does, so long caching is safe.
const CACHE_HEADER = 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000';

// These CDNs refuse datacentre IPs. Sending the browser straight there avoids
// a multi-second server timeout on every uncached request.
const BROWSER_ONLY_HOSTS = [/(^|\.)bigw\.com\.au$/, /(^|\.)woolworths\.media$/, /(^|\.)woolworths\.com\.au$/];

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

function redirectToSource(url: string): NextResponse {
  const response = NextResponse.redirect(url, 302);
  response.headers.set('Cache-Control', CACHE_HEADER);
  return response;
}

async function storedImageUrl(request: NextRequest): Promise<string | null | 'bad'> {
  const productId = request.nextUrl.searchParams.get('product') || '';
  const linkId = request.nextUrl.searchParams.get('link') || '';
  const supabase = getReadClient();

  if (productId) {
    if (!UUID.test(productId)) return 'bad';
    const { data, error } = await supabase
      .from('products')
      .select('image_url')
      .eq('id', productId)
      .maybeSingle();
    return error ? null : (data?.image_url as string | null) ?? null;
  }

  if (!UUID.test(linkId)) return 'bad';
  const { data, error } = await supabase
    .from('tracked_links')
    .select('image_url')
    .eq('id', linkId)
    .maybeSingle();
  return error ? null : (data?.image_url as string | null) ?? null;
}

export async function GET(request: NextRequest) {
  const imageUrl = await storedImageUrl(request);
  if (imageUrl === 'bad') {
    return new NextResponse('Bad request', { status: 400 });
  }
  if (!imageUrl || !isPublicHttps(imageUrl)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const host = new URL(imageUrl).hostname.toLowerCase();
  if (BROWSER_ONLY_HOSTS.some((pattern) => pattern.test(host))) {
    return redirectToSource(imageUrl);
  }

  let upstream: Response;
  try {
    upstream = await fetch(imageUrl, {
      headers: {
        Accept: 'image/png,image/webp,image/jpeg,image/*;q=0.8,*/*;q=0.5',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept-Language': 'en-AU,en;q=0.9'
      },
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000)
    });
  } catch {
    return redirectToSource(imageUrl);
  }

  if (!upstream.ok) {
    return redirectToSource(imageUrl);
  }

  const length = Number(upstream.headers.get('content-length') || 0);
  if (length > MAX_BYTES) {
    return redirectToSource(imageUrl);
  }

  const input = Buffer.from(await upstream.arrayBuffer());
  if (input.length === 0 || input.length > MAX_BYTES) {
    return redirectToSource(imageUrl);
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
      return redirectToSource(imageUrl);
    }
  }

  return new NextResponse(new Uint8Array(output), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': CACHE_HEADER
    }
  });
}
