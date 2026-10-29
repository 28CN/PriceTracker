import { describe, expect, test } from 'vitest';

import { DEMO_USER_ID } from './demo.ts';
import {
  DEMO_SESSION_MAX_AGE_SECONDS,
  demoSessionSecondsLeft,
  isDemoSessionExpired,
  isSupabaseAuthCookie
} from './demoSession.ts';

const t0 = 1_800_000_000;
const demo = (ts?: number) => ({ sub: DEMO_USER_ID, amr: ts === undefined ? [] : [{ method: 'password', timestamp: ts }] });

describe('demo session lifetime', () => {
  test('is 1 hour', () => expect(DEMO_SESSION_MAX_AGE_SECONDS).toBe(3600));
  test('fresh demo session is live', () => {
    expect(isDemoSessionExpired(demo(t0), t0 + 3599)).toBe(false);
    expect(demoSessionSecondsLeft(demo(t0), t0 + 600)).toBe(3000);
  });
  test('expires at 1 hour', () => {
    expect(isDemoSessionExpired(demo(t0), t0 + 3600)).toBe(true);
    expect(demoSessionSecondsLeft(demo(t0), t0 + 9999)).toBe(0);
  });
  test('missing sign-in time fails closed', () => {
    expect(isDemoSessionExpired(demo(), t0)).toBe(true);
    expect(isDemoSessionExpired({ sub: DEMO_USER_ID }, t0)).toBe(true);
  });
  test('non-demo users never expire here', () => {
    expect(isDemoSessionExpired({ sub: 'someone', amr: [] }, t0)).toBe(false);
    expect(isDemoSessionExpired(null, t0)).toBe(false);
    expect(demoSessionSecondsLeft({ sub: 'someone' }, t0)).toBeNull();
  });
  test('ignores non-password amr entries', () => {
    const c = { sub: DEMO_USER_ID, amr: [{ method: 'password', timestamp: t0 }, { method: 'otp', timestamp: t0 + 3000 }] };
    expect(isDemoSessionExpired(c, t0 + 3600)).toBe(true);
  });
  test('auth cookie names', () => {
    expect(isSupabaseAuthCookie('sb-abc-auth-token')).toBe(true);
    expect(isSupabaseAuthCookie('sb-abc-auth-token.1')).toBe(true);
    expect(isSupabaseAuthCookie('theme')).toBe(false);
  });
});
