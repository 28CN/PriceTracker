import { NextResponse } from 'next/server';

import { getApiAuth } from '@/lib/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { dispatchCrawl } from '@/lib/github/dispatch';

export async function POST(request: Request) {
  try {
    const auth = await getApiAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    }
    const body = (await request.json().catch(() => ({}))) as {
      productId?: string;
      linkId?: string;
    };

    let productId = body.productId || '';
    const linkId = body.linkId || '';

    if (linkId && !productId) {
      const { data: link } = await auth.supabase
        .from('tracked_links')
        .select('product_id')
        .eq('id', linkId)
        .maybeSingle();
      productId = link?.product_id || '';
    }

    if (productId) {
      const { data: ownedProduct } = await auth.supabase
        .from('products')
        .select('id')
        .eq('id', productId)
        .eq('owner_id', auth.userId)
        .maybeSingle();
      if (!ownedProduct) {
        return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
      }
    } else if (!auth.isAdmin) {
      return NextResponse.json(
        { error: 'Only an administrator can refresh every account.' },
        { status: 403 }
      );
    }

    const admin = createAdminSupabaseClient();
    const { data: job, error: jobError } = await admin
      .from('crawl_jobs')
      .insert({
        requested_by: auth.userId,
        product_id: productId || null,
        link_id: linkId || null,
        status: 'pending'
      })
      .select('id')
      .single();
    if (jobError || !job) {
      const missingTable = /crawl_jobs|does not exist|42P01/i.test(jobError?.message || '');
      if (!missingTable) {
        return NextResponse.json(
          { error: jobError?.message || 'Could not save the refresh.' },
          { status: 500 }
        );
      }
    }

    const queuedMessage = 'Refresh queued. It will run on the next crawl.';
    const dispatch = await dispatchCrawl({
      product_id: productId,
      link_id: linkId,
      force_refresh: 'true'
    });
    if (!dispatch.ok) {
      if (dispatch.reason !== 'NOT_CONFIGURED') {
        console.warn(`[refresh] ${dispatch.message}`);
      }
      if (jobError || !job) {
        return NextResponse.json(
          { error: 'Refresh could not be saved. Run the latest Supabase migration.' },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true, message: queuedMessage });
    }

    return NextResponse.json({
      ok: true,
      message: 'Refresh queued. It will start shortly.'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

