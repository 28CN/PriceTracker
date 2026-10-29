import assert from 'node:assert/strict';
import test from 'node:test';

import { DEMO_USER_ID, demoReadOnlyResponse, isDemoUser } from './demo.ts';

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
