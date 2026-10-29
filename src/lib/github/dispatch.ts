// Single place that triggers the crawler GitHub Actions workflow (workflow_dispatch).
// The token is never included in returned errors or logs.

export type DispatchEnv = Record<string, string | undefined>;

export type DispatchConfig = {
  token: string;
  owner: string;
  repo: string;
  workflowId: string;
  ref: string;
};

export type DispatchResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_CONFIGURED' | 'INVALID_CONFIG' | 'HTTP_ERROR' | 'TIMEOUT' | 'NETWORK_ERROR'; status?: number; message: string };

const NAME_RE = /^[A-Za-z0-9_.-]{1,100}$/;
const WORKFLOW_RE = /^([A-Za-z0-9_.-]{1,100}\.ya?ml|\d{1,20})$/;
const REF_RE = /^[A-Za-z0-9_./-]{1,200}$/;
export const DEFAULT_TIMEOUT_MS = 8000;

export function readDispatchConfig(
  env: DispatchEnv = process.env
): { config: DispatchConfig } | { config: null; reason: 'NOT_CONFIGURED' | 'INVALID_CONFIG'; message: string } {
  const token = env.GITHUB_TOKEN?.trim();
  const owner = env.GITHUB_OWNER?.trim();
  const repo = env.GITHUB_REPO?.trim();
  const workflowId = env.GITHUB_WORKFLOW_ID?.trim();
  const ref = env.GITHUB_REF?.trim() || 'main';
  if (!token || !owner || !repo || !workflowId) {
    return { config: null, reason: 'NOT_CONFIGURED', message: 'GitHub dispatch is not configured.' };
  }
  if (!NAME_RE.test(owner) || !NAME_RE.test(repo) || owner.includes('..') || repo.includes('..')) {
    return { config: null, reason: 'INVALID_CONFIG', message: 'GITHUB_OWNER or GITHUB_REPO is invalid.' };
  }
  if (!WORKFLOW_RE.test(workflowId)) {
    return { config: null, reason: 'INVALID_CONFIG', message: 'GITHUB_WORKFLOW_ID is invalid.' };
  }
  if (!REF_RE.test(ref) || ref.includes('..')) {
    return { config: null, reason: 'INVALID_CONFIG', message: 'GITHUB_REF is invalid.' };
  }
  if (/\s/.test(token)) {
    return { config: null, reason: 'INVALID_CONFIG', message: 'GITHUB_TOKEN is invalid.' };
  }
  return { config: { token, owner, repo, workflowId, ref } };
}

function redact(text: string, token: string): string {
  return token ? text.split(token).join('[redacted]') : text;
}

export async function dispatchCrawl(
  inputs: Record<string, string>,
  opts: { env?: DispatchEnv; fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<DispatchResult> {
  const read = readDispatchConfig(opts.env ?? process.env);
  if (!read.config) return { ok: false, reason: read.reason, message: read.message };
  const { token, owner, repo, workflowId, ref } = read.config;
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflowId)}/dispatches`;
  try {
    const response = await doFetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({ ref, inputs }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    });
    if (response.status === 204 || response.ok) return { ok: true };
    return {
      ok: false,
      reason: 'HTTP_ERROR',
      status: response.status,
      message: `GitHub workflow dispatch failed with status ${response.status}.`
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      return { ok: false, reason: 'TIMEOUT', message: 'GitHub workflow dispatch timed out.' };
    }
    const raw = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: 'NETWORK_ERROR', message: redact(`GitHub workflow dispatch failed: ${raw}`, token) };
  }
}
