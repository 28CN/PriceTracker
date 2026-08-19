import { NextResponse } from 'next/server';

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      productId?: string;
      linkId?: string;
    };

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
            product_id: body.productId || '',
            link_id: body.linkId || '',
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

