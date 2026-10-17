import { NextResponse } from 'next/server';

import { getApiAuth } from '@/lib/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

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
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const workflowId = process.env.GITHUB_WORKFLOW_ID;
    const token = process.env.GITHUB_TOKEN;
    if (!owner || !repo || !workflowId || !token) {
      if (jobError) {
        return NextResponse.json(
          { error: 'Refresh could not be saved. Run the latest Supabase migration.' },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true, message: queuedMessage });
    }

    const ref = process.env.GITHUB_REF || 'main';
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify({
          ref,
          inputs: {
            product_id: productId,
            link_id: linkId,
            force_refresh: 'true'
          }
        }),
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      if (!job) {
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

