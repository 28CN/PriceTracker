#!/usr/bin/env node
// Hand-written API tests for the read-only demo account (PR5).
// 1. Signs in through GET /demo and keeps the session cookies.
// 2. Calls every write API route and expects HTTP 403 (code demo_read_only).
// 3. Optionally (when NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
//    DEMO_ACCOUNT_PASSWORD are set) signs in directly to Supabase as the demo user
//    and checks RLS rejects writes even without the API layer.
// Usage: BASE_URL=http://localhost:3000 node scripts/test-demo-readonly.mjs
import assert from 'node:assert/strict';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const FAKE_ID = '00000000-0000-4000-8000-000000000000';

const WRITE_ENDPOINTS = [
  ['POST', '/api/products', { name: 'x', links: [{ url: 'https://example.com' }] }],
  ['PATCH', `/api/products/${FAKE_ID}`, { name: 'x' }],
  ['POST', '/api/links', { productId: FAKE_ID, links: [{ url: 'https://example.com' }] }],
  ['PATCH', `/api/links/${FAKE_ID}`, { url: 'https://example.com' }],
  ['DELETE', `/api/links/${FAKE_ID}`, null],
  ['POST', '/api/categories', { name: 'x' }],
  ['PATCH', `/api/categories/${FAKE_ID}`, { isPublic: false }],
  ['PUT', '/api/preferences', { key: 'x', value: 'y' }],
  ['POST', '/api/refresh', {}],
  ['POST', '/api/notifications', { action: 'mark-read' }],
  ['PATCH', '/api/account', { displayName: 'x' }],
  ['POST', '/api/account/password', { newPassword: 'longenoughpassword' }],
  ['POST', '/api/account/delete', {}],
  ['DELETE', '/api/account/data', null]
];

function cookieHeader(setCookies) {
  return setCookies.map((c) => c.split(';')[0]).join('; ');
}

let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}\n     ${error.message}`);
  }
}

const login = await fetch(`${BASE_URL}/demo`, { redirect: 'manual' });
const cookies = login.headers.getSetCookie();
await check('GET /demo redirects home and sets a session cookie', () => {
  assert.equal(login.status, 303);
  assert.equal(new URL(login.headers.get('location'), BASE_URL).pathname, '/');
  assert.ok(cookies.some((c) => c.startsWith('sb-')), 'no sb-* auth cookie set');
});
const cookie = cookieHeader(cookies);

await check('public demo page /demo-shop returns 200 when signed out', async () => {
  const res = await fetch(`${BASE_URL}/demo-shop`);
  assert.equal(res.status, 200);
});

await check('signed-in demo page shows the read-only banner', async () => {
  const res = await fetch(`${BASE_URL}/`, { headers: { cookie } });
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /Demo, read-only/);
});

await check('demo user can still read (GET /api/preferences)', async () => {
  const res = await fetch(`${BASE_URL}/api/preferences`, { headers: { cookie } });
  assert.equal(res.status, 200);
});

for (const [method, path, body] of WRITE_ENDPOINTS) {
  await check(`${method} ${path} -> 403 for demo`, async () => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { cookie, origin: BASE_URL, 'content-type': 'application/json' },
      body: body === null ? undefined : JSON.stringify(body)
    });
    const json = await res.json().catch(() => ({}));
    assert.equal(res.status, 403, `got ${res.status} ${JSON.stringify(json)}`);
    assert.equal(json.code, 'demo_read_only');
  });
}

const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, DEMO_ACCOUNT_PASSWORD: pw } =
  process.env;
if (url && anon && pw) {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data: session, error } = await sb.auth.signInWithPassword({
    email: 'demo@users.invalid',
    password: pw
  });
  await check('database: demo user can sign in directly', () => assert.ifError(error));
  const uid = session?.user?.id;
  await check('database: RLS rejects demo INSERT into categories', async () => {
    const { error: e } = await sb.from('categories').insert({ name: 'rls-probe', owner_id: uid });
    assert.ok(e, 'insert unexpectedly succeeded');
    assert.equal(e.code, '42501');
  });
  await check('database: RLS turns demo UPDATE of products into a no-op', async () => {
    const { data } = await sb.from('products').update({ name: 'rls-probe' }).eq('owner_id', uid).select('id');
    assert.equal((data || []).length, 0);
  });
  await check('database: RLS turns demo DELETE of tracked_links into a no-op', async () => {
    const { data } = await sb.from('tracked_links').delete().not('id', 'is', null).select('id');
    assert.equal((data || []).length, 0);
  });
  await check('database: demo user cannot clear its own is_demo flag', async () => {
    const { data } = await sb.from('profiles').update({ is_demo: false }).eq('id', uid).select('id');
    assert.equal((data || []).length, 0);
  });
  await check('database: demo user can still read its products', async () => {
    const { data, error: e } = await sb.from('products').select('id').eq('owner_id', uid);
    assert.ifError(e);
    assert.ok((data || []).length > 0);
  });
} else {
  console.log('skip database checks (Supabase URL/anon key/DEMO_ACCOUNT_PASSWORD not set)');
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
