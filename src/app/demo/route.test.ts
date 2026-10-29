// POST /demo with the Supabase admin API, server client and rate limiter mocked.
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const calls: string[] = [];
const updateUserById = vi.fn();
const signInWithPassword = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => ({ auth: { admin: { updateUserById } } })
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { signInWithPassword } })
}));
vi.mock('@/lib/auth', () => ({
  consumeAuthRateLimit: async () => {
    calls.push('limit');
    return true;
  }
}));

const { POST } = await import('./route.ts');
const { DEMO_AUTH_EMAIL, DEMO_USER_ID } = await import('@/lib/demo');

function demoRequest() {
  return new NextRequest('https://pt.example/demo', {
    method: 'POST',
    headers: { origin: 'https://pt.example' }
  });
}

describe('POST /demo', () => {
  beforeEach(() => {
    calls.length = 0;
    vi.stubEnv('DEMO_ACCOUNT_PASSWORD', 'demo-pw-for-tests');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    updateUserById.mockReset().mockImplementation(async () => {
      calls.push('reset');
      return { error: null };
    });
    signInWithPassword.mockReset().mockImplementation(async () => {
      calls.push('signin');
      return { error: null };
    });
  });

  test('always resets the demo credentials before signing in', async () => {
    const res = await POST(demoRequest());

    expect(calls).toEqual(['limit', 'reset', 'signin']);
    expect(updateUserById).toHaveBeenCalledWith(DEMO_USER_ID, {
      email: DEMO_AUTH_EMAIL,
      password: 'demo-pw-for-tests',
      email_confirm: true
    });
    expect(signInWithPassword).toHaveBeenCalledWith({ email: DEMO_AUTH_EMAIL, password: 'demo-pw-for-tests' });
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/');
  });

  test('resets on every hit, not just the first', async () => {
    await POST(demoRequest());
    await POST(demoRequest());
    expect(calls).toEqual(['limit', 'reset', 'signin', 'limit', 'reset', 'signin']);
  });

  test('reset fails (error) -> refuses login', async () => {
    updateUserById.mockImplementation(async () => {
      calls.push('reset');
      return { error: { message: 'boom' } };
    });
    const res = await POST(demoRequest());

    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://pt.example/login?demo=unavailable');
  });

  test('reset throws -> refuses login', async () => {
    updateUserById.mockRejectedValue(new Error('network down'));
    const res = await POST(demoRequest());

    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('https://pt.example/login?demo=unavailable');
  });

  test('cross-site POST is rejected before the admin API is touched', async () => {
    const res = await POST(
      new NextRequest('https://pt.example/demo', { method: 'POST', headers: { origin: 'https://evil.example' } })
    );
    expect(res.status).toBe(403);
    expect(updateUserById).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
