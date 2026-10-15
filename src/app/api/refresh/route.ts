import { NextResponse } from 'next/server';

import { getApiAuth } from '@/lib/auth';

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

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

    const owner = getRequiredEnv('GITHUB_OWNER');
    const repo = getRequiredEnv('GITHUB_REPO');
    const workflowId = getRequiredEnv('GITHUB_WORKFLOW_ID');
    const token = getRequiredEnv('GITHUB_TOKEN');
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
      const errorText = await response.text();
      return NextResponse.json(
        {
          error: `GitHub workflow dispatch failed: ${response.status} ${errorText}`
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Refresh queued in GitHub Actions. Come back in 1-3 minutes.'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

