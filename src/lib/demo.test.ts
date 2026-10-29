import assert from 'node:assert/strict';
import { test } from 'vitest';

import { resetDemoCredentials } from './demoReset.ts';
import { validateUsername } from './username.ts';
import { DEMO_AUTH_EMAIL, DEMO_PUBLIC_SLUG, DEMO_USER_ID, demoReadOnlyResponse, isDemoUser } from './demo.ts';

function fakeSupabase(result: { data: { is_demo?: boolean } | null; error: unknown }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => result })
      })
    })
  };
}

test('isDemoUser: flagged profile is demo', async () => {
  assert.equal(await isDemoUser(fakeSupabase({ data: { is_demo: true }, error: null }), 'u1'), true);
});

test('isDemoUser: normal profile is not demo', async () => {
  assert.equal(await isDemoUser(fakeSupabase({ data: { is_demo: false }, error: null }), 'u1'), false);
});

test('isDemoUser: the seeded demo id is always demo', async () => {
  assert.equal(await isDemoUser(fakeSupabase({ data: null, error: null }), DEMO_USER_ID), true);
});

test('isDemoUser: fails closed when the lookup errors', async () => {
  assert.equal(await isDemoUser(fakeSupabase({ data: null, error: new Error('x') }), 'u1'), true);
});

test('demoReadOnlyResponse is a 403 JSON error', async () => {
  const res = demoReadOnlyResponse();
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.code, 'demo_read_only');
});

test('demo public slug is valid and does not collide with the /demo route', () => {
  assert.equal(DEMO_PUBLIC_SLUG, 'demo-shop');
  assert.equal(validateUsername(DEMO_PUBLIC_SLUG), null);
  assert.notEqual(validateUsername('demo'), null);
});

test('resetDemoCredentials restores the demo email and password', async () => {
  const calls: unknown[] = [];
  const admin = { auth: { admin: { updateUserById: async (id: string, attrs: object) => {
    calls.push([id, attrs]);
    return { error: null };
  } } } };
  assert.equal(await resetDemoCredentials(admin, 'pw'), true);
  assert.deepEqual(calls, [[DEMO_USER_ID, { email: DEMO_AUTH_EMAIL, password: 'pw', email_confirm: true }]]);
});

test('resetDemoCredentials fails closed', async () => {
  const failing = { auth: { admin: { updateUserById: async () => ({ error: { message: 'nope' } }) } } };
  const throwing = { auth: { admin: { updateUserById: async () => { throw new Error('down'); } } } };
  assert.equal(await resetDemoCredentials(failing, 'pw'), false);
  assert.equal(await resetDemoCredentials(throwing, 'pw'), false);
  assert.equal(await resetDemoCredentials(null, 'pw'), false);
  assert.equal(await resetDemoCredentials(failing, ''), false);
});

import { isSameSiteDemoRequest, runDemoSignIn } from './demoFlow.ts';

const URL_ = 'https://pt.example/demo';
const h = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });

test('isSameSiteDemoRequest accepts same origin only', () => {
  assert.equal(isSameSiteDemoRequest(h({ origin: 'https://pt.example' }), URL_), true);
  assert.equal(isSameSiteDemoRequest(h({ origin: 'https://evil.example' }), URL_), false);
  assert.equal(isSameSiteDemoRequest(h({ origin: 'null' }), URL_), false);
  assert.equal(isSameSiteDemoRequest(h({ 'sec-fetch-site': 'same-origin' }), URL_), true);
  assert.equal(isSameSiteDemoRequest(h({ 'sec-fetch-site': 'cross-site' }), URL_), false);
  assert.equal(isSameSiteDemoRequest(h({}), URL_), false);
});

function deps(over: Partial<Parameters<typeof runDemoSignIn>[0]> = {}) {
  const calls: string[] = [];
  const d = {
    password: 'pw',
    sameOrigin: true,
    consumeRateLimit: async () => { calls.push('limit'); return true; },
    resetCredentials: async () => { calls.push('reset'); return true; },
    signIn: async () => { calls.push('signin'); return true; },
    ...over
  };
  return { d, calls };
}

test('runDemoSignIn: rate limit, then reset, then sign-in', async () => {
  const { d, calls } = deps();
  assert.deepEqual(await runDemoSignIn(d), { status: 303, location: '/' });
  assert.deepEqual(calls, ['limit', 'reset', 'signin']);
});

test('runDemoSignIn: cross-site request is rejected before anything runs', async () => {
  const { d, calls } = deps({ sameOrigin: false });
  assert.deepEqual(await runDemoSignIn(d), { status: 403 });
  assert.deepEqual(calls, []);
});

test('runDemoSignIn: rate limited skips the admin reset', async () => {
  const { d, calls } = deps();
  d.consumeRateLimit = async () => { calls.push('limit'); return false; };
  assert.deepEqual(await runDemoSignIn(d), { status: 303, location: '/login?demo=rate_limited' });
  assert.deepEqual(calls, ['limit']);
});

test('runDemoSignIn fails closed', async () => {
  assert.deepEqual(await runDemoSignIn(deps({ password: undefined }).d), { status: 303, location: '/login?demo=unavailable' });
  assert.deepEqual(await runDemoSignIn(deps({ resetCredentials: async () => false }).d), { status: 303, location: '/login?demo=unavailable' });
  assert.deepEqual(await runDemoSignIn(deps({ signIn: async () => false }).d), { status: 303, location: '/login?demo=unavailable' });
  assert.deepEqual(
    await runDemoSignIn(deps({ consumeRateLimit: async () => { throw new Error('db down'); } }).d),
    { status: 303, location: '/login?demo=unavailable' }
  );
});
