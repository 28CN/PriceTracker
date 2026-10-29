import { test } from 'vitest';
import assert from 'node:assert/strict';
import { dispatchCrawl, readDispatchConfig } from './dispatch.ts';

const TOKEN = 'github_pat_SECRET123';
const env = { GITHUB_TOKEN: TOKEN, GITHUB_OWNER: '28CN', GITHUB_REPO: 'PriceTracker', GITHUB_WORKFLOW_ID: 'crawl-prices.yml' };

test('not configured when vars are missing', () => {
  const r = readDispatchConfig({ GITHUB_OWNER: '28CN' });
  assert.equal(r.config, null);
  assert.equal((r as { reason: string }).reason, 'NOT_CONFIGURED');
});

test('defaults ref to main', () => {
  assert.equal(readDispatchConfig(env).config?.ref, 'main');
});

test('rejects path injection in owner/repo/workflow/ref', () => {
  for (const bad of [
    { GITHUB_OWNER: '../x' },
    { GITHUB_REPO: 'a/b' },
    { GITHUB_WORKFLOW_ID: '../../evil' },
    { GITHUB_REF: 'main..x' }
  ]) {
    assert.equal(readDispatchConfig({ ...env, ...bad }).config, null);
  }
});

test('sends a single workflow_dispatch POST', async () => {
  const calls: [string, RequestInit][] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push([url, init]);
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
  const r = await dispatchCrawl({ product_id: '1' }, { env: { ...env, GITHUB_REF: 'dev' }, fetchImpl });
  assert.deepEqual(r, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://api.github.com/repos/28CN/PriceTracker/actions/workflows/crawl-prices.yml/dispatches');
  assert.equal(calls[0][1].method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0][1].body)), { ref: 'dev', inputs: { product_id: '1' } });
});

test('HTTP error does not leak token', async () => {
  const fetchImpl = (async () => new Response(`bad ${TOKEN}`, { status: 401 })) as unknown as typeof fetch;
  const r = await dispatchCrawl({}, { env, fetchImpl });
  assert.equal(r.ok, false);
  assert.equal((r as { status?: number }).status, 401);
  assert.ok(!JSON.stringify(r).includes(TOKEN));
});

test('network error message is redacted', async () => {
  const fetchImpl = (async () => { throw new Error(`boom ${TOKEN}`); }) as unknown as typeof fetch;
  const r = await dispatchCrawl({}, { env, fetchImpl });
  assert.equal((r as { reason: string }).reason, 'NETWORK_ERROR');
  assert.ok(!JSON.stringify(r).includes(TOKEN));
});

test('times out', async () => {
  const fetchImpl = ((_u: string, init: RequestInit) =>
    new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(init.signal!.reason)))) as unknown as typeof fetch;
  const r = await dispatchCrawl({}, { env, fetchImpl, timeoutMs: 20 });
  assert.equal((r as { reason: string }).reason, 'TIMEOUT');
});
