// Run with: npm test (Vitest)
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { assertSafeUrl, isBlockedAddress, safeFetch, SafeFetchError, type LookupFn } from './safeFetch.ts';

const publicLookup: LookupFn = async () => [{ address: '93.184.216.34', family: 4 }];
const mapLookup = (m: Record<string, string>): LookupFn => async (h) =>
  m[h] ? [{ address: m[h], family: m[h].includes(':') ? 6 : 4 }] : Promise.reject(new Error('NXDOMAIN'));

const code = (c: string) => (e: unknown) => e instanceof SafeFetchError && e.code === c;

test('blocks private / reserved IPv4', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '255.255.255.255', '198.18.0.1']) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '1.1.1.1']) {
    assert.equal(isBlockedAddress(ip), false, ip);
  }
});

test('blocks private / reserved IPv6 incl. IPv4-mapped', () => {
  for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:169.254.169.254', '::ffff:a9fe:a9fe', '64:ff9b::a9fe:a9fe', '2001:db8::1', '2002:7f00:1::']) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
  for (const ip of ['2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isBlockedAddress(ip), false, ip);
  }
});

test('assertSafeUrl rejects bad protocols, literals, and private DNS', async () => {
  await assert.rejects(assertSafeUrl('file:///etc/passwd', publicLookup), code('BAD_PROTOCOL'));
  await assert.rejects(assertSafeUrl('ftp://example.com/x', publicLookup), code('BAD_PROTOCOL'));
  await assert.rejects(assertSafeUrl('http://169.254.169.254/latest/meta-data', publicLookup), code('BLOCKED_ADDRESS'));
  await assert.rejects(assertSafeUrl('http://[::ffff:127.0.0.1]/', publicLookup), code('BLOCKED_ADDRESS'));
  await assert.rejects(assertSafeUrl('http://localhost/', publicLookup), code('BLOCKED_ADDRESS'));
  await assert.rejects(assertSafeUrl('https://user:pw@example.com/', publicLookup), code('BAD_URL'));
  await assert.rejects(assertSafeUrl('https://evil.test/', mapLookup({ 'evil.test': '10.0.0.5' })), code('BLOCKED_ADDRESS'));
  await assert.rejects(assertSafeUrl('https://nx.test/', mapLookup({})), code('DNS_FAILED'));
  const ok = await assertSafeUrl('https://example.com/a.png', publicLookup);
  assert.equal(ok.hostname, 'example.com');
});

function fakeFetch(routes: Record<string, () => Response>): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(init?.redirect, 'manual');
    const r = routes[String(input)];
    if (!r) throw new Error('unexpected ' + input);
    return r();
  }) as typeof fetch;
}

test('returns image body', async () => {
  const res = await safeFetch('https://cdn.test/a.png', {
    lookup: mapLookup({ 'cdn.test': '93.184.216.34' }),
    fetchImpl: fakeFetch({ 'https://cdn.test/a.png': () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }) })
  });
  assert.equal(res.body.length, 3);
  assert.equal(res.contentType, 'image/png');
});

test('re-validates redirect hops', async () => {
  await assert.rejects(
    safeFetch('https://cdn.test/a.png', {
      lookup: mapLookup({ 'cdn.test': '93.184.216.34' }),
      fetchImpl: fakeFetch({
        'https://cdn.test/a.png': () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } })
      })
    }),
    code('BLOCKED_ADDRESS')
  );
});

test('follows a safe relative redirect', async () => {
  const res = await safeFetch('https://cdn.test/a.png', {
    lookup: mapLookup({ 'cdn.test': '93.184.216.34' }),
    fetchImpl: fakeFetch({
      'https://cdn.test/a.png': () => new Response(null, { status: 301, headers: { location: '/b.png' } }),
      'https://cdn.test/b.png': () => new Response(new Uint8Array([9]), { headers: { 'content-type': 'image/jpeg' } })
    })
  });
  assert.equal(res.finalUrl, 'https://cdn.test/b.png');
});

test('caps redirect hops', async () => {
  await assert.rejects(
    safeFetch('https://cdn.test/loop', {
      maxRedirects: 2,
      lookup: publicLookup,
      fetchImpl: fakeFetch({ 'https://cdn.test/loop': () => new Response(null, { status: 302, headers: { location: '/loop' } }) })
    }),
    code('TOO_MANY_REDIRECTS')
  );
});

test('rejects non-image content type', async () => {
  await assert.rejects(
    safeFetch('https://cdn.test/a', {
      lookup: publicLookup,
      fetchImpl: fakeFetch({ 'https://cdn.test/a': () => new Response('<html>', { headers: { 'content-type': 'text/html' } }) })
    }),
    code('BAD_CONTENT_TYPE')
  );
});

test('enforces byte cap while streaming (no content-length)', async () => {
  const stream = new ReadableStream({
    pull(c) {
      c.enqueue(new Uint8Array(1024));
    }
  });
  await assert.rejects(
    safeFetch('https://cdn.test/big', {
      maxBytes: 4096,
      lookup: publicLookup,
      fetchImpl: fakeFetch({ 'https://cdn.test/big': () => new Response(stream, { headers: { 'content-type': 'image/png' } }) })
    }),
    code('TOO_LARGE')
  );
});

test('times out', async () => {
  const hang = ((_: unknown, init?: RequestInit) =>
    new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as typeof fetch;
  await assert.rejects(safeFetch('https://cdn.test/slow', { timeoutMs: 50, lookup: publicLookup, fetchImpl: hang }), code('TIMEOUT'));
});

test('DNS rebinding: pre-check sees public IP, connect-time resolve gets 127.0.0.1 -> rejected', async () => {
  const { createServer } = await import('node:http');
  let hits = 0;
  const server = createServer((_req, res) => {
    hits++;
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end('x');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  let calls = 0;
  const rebinding: LookupFn = async () =>
    ++calls === 1 ? [{ address: '93.184.216.34', family: 4 }] : [{ address: '127.0.0.1', family: 4 }];
  try {
    await assert.rejects(
      safeFetch(`http://rebind.test:${port}/a.png`, { lookup: rebinding, timeoutMs: 3000 }),
      code('BLOCKED_ADDRESS')
    );
    assert.ok(calls >= 2, 'connect-time lookup must run');
    assert.equal(hits, 0, 'internal server must never be reached');
  } finally {
    server.close();
  }
});

test('pinned connection reaches the validated IP (sanity)', async () => {
  const { createValidatingLookup } = await import('./safeFetch.ts');
  type LookupFn = (host: string, opts: object, cb: (e: unknown, a: unknown) => void) => void;
  const lk = createValidatingLookup(async () => [{ address: '93.184.216.34', family: 4 }]);
  const addr = await new Promise((res, rej) =>
    (lk as unknown as LookupFn)('cdn.test', {}, (e: unknown, a: unknown) => (e ? rej(e) : res(a)))
  );
  assert.equal(addr, '93.184.216.34');
  await assert.rejects(
    new Promise((res, rej) =>
      (createValidatingLookup(async () => [{ address: '10.0.0.1', family: 4 }]) as unknown as LookupFn)('x', { all: true }, (e: unknown, a: unknown) => (e ? rej(e) : res(a)))
    ),
    code('BLOCKED_ADDRESS')
  );
});
