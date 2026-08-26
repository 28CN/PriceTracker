import { NextResponse } from 'next/server';

import { parseListKind } from '@/lib/listKind';
import { detectRetailer, isValidHttpUrl } from '@/lib/retailer';
import { getWriteClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type IncomingLink = { url?: string; retailer?: string };

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      categoryId?: string | null;
      newCategoryName?: string | null;
      targetPrice?: string | number | null;
      listKind?: string | null;
      imageUrl?: string | null;
      links?: IncomingLink[];
    };

    const name = (body.name || '').trim();
    if (!name) {
      return NextResponse.json({ error: 'Product name is required.' }, { status: 400 });
    }

    const cleanedLinks = (body.links || [])
      .map((link) => ({
        url: (link.url || '').trim(),
        retailer: (link.retailer || '').trim()
      }))
      .filter((link) => link.url.length > 0);

    const invalid = cleanedLinks.find((link) => !isValidHttpUrl(link.url));
    if (invalid) {
      return NextResponse.json({ error: `Not a valid link: ${invalid.url}` }, { status: 400 });
    }

    const supabase = getWriteClient();

    let categoryId = body.categoryId || null;
    const newCategoryName = (body.newCategoryName || '').trim();

    if (!categoryId && newCategoryName) {
      const { data: existing } = await supabase
        .from('categories')
        .select('id')
        .ilike('name', newCategoryName)
        .maybeSingle();

      if (existing) {
        categoryId = existing.id;
      } else {
        const { data: created, error: categoryError } = await supabase
          .from('categories')
          .insert({ name: newCategoryName })
          .select('id')
          .single();

        if (categoryError) {
          return NextResponse.json({ error: categoryError.message }, { status: 500 });
        }
        categoryId = created.id;
      }
    }

    const targetPriceRaw = body.targetPrice;
    const targetPrice =
      targetPriceRaw === null || targetPriceRaw === undefined || targetPriceRaw === ''
        ? null
        : Number(targetPriceRaw);

    if (targetPrice !== null && !Number.isFinite(targetPrice)) {
      return NextResponse.json({ error: 'Target price must be a number.' }, { status: 400 });
    }

    const listKind = parseListKind(body.listKind) ?? 'daigou';
    const imageUrl = (body.imageUrl || '').trim() || null;

    const row: Record<string, unknown> = {
      name,
      category_id: categoryId,
      target_price: targetPrice,
      list_kind: listKind,
      image_url: imageUrl
    };

    let { data: product, error: productError } = await supabase
      .from('products')
      .insert(row)
      .select('id')
      .single();

    if (productError && /list_kind|image_url/.test(productError.message)) {
      const retry = await supabase
        .from('products')
        .insert({ name, category_id: categoryId, target_price: targetPrice })
        .select('id')
        .single();
      product = retry.data;
      productError = retry.error;
    }

    if (productError || !product) {
      return NextResponse.json(
        { error: productError?.message || 'Could not save the product.' },
        { status: 500 }
      );
    }

    if (cleanedLinks.length > 0) {
      const rows = cleanedLinks.map((link) => ({
        product_id: product.id,
        url: link.url,
        retailer: link.retailer || detectRetailer(link.url) || 'Unknown shop',
        is_active: true
      }));

      const { error: linkError } = await supabase.from('tracked_links').insert(rows);
      if (linkError) {
        return NextResponse.json({ error: linkError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, productId: product.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
