// POST /api/account/password with Supabase clients, auth guard and rate limiter mocked.
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const getWritableApiAuth = vi.fn();
const consumeAuthRateLimit = vi.fn();
const signInWithPassword = vi.fn();
const createClientMock = vi.fn();
const updateUserById = vi.fn();
const securityEq = vi.fn();
const accountMaybeSingle = vi.fn();
const profileMaybeSingle = vi.fn();

vi.mock('@/lib/demoGuard', () => ({
  getWritableApiAuth: () => getWritableApiAuth()
}));

vi.mock('@/lib/auth', () => ({
  assertSameOrigin: (request: NextRequest) => {
    const origin = request.headers.get('origin');
    if (!origin) return true;
    return origin === new URL(request.url).origin;
  },
  consumeAuthRateLimit: (...args: unknown[]) => consumeAuthRateLimit(...args)
}));

vi.mock('@/lib/supabase/config', () => ({
  getSupabaseUrl: () => 'https://project.supabase.co',
  getSupabasePublishableKey: () => 'anon-key-for-tests'
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args)
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => ({
    auth: { admin: { updateUserById } },
    from: (table: string) => {
      if (table === 'account_private') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: accountMaybeSingle })
          })
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: profileMaybeSingle })
          })
        };
      }
      if (table === 'user_security') {
        return {
          update: () => ({ eq: securityEq })
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }
  })
}));

const { POST } = await import('./route.ts');

function passwordRequest(body: Record<string, unknown>, origin = 'https://pt.example') {
  return new NextRequest('https://pt.example/api/account/password', {
    method: 'POST',
    headers: {
      origin,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

describe('POST /api/account/password', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getWritableApiAuth.mockReset().mockResolvedValue({
      ok: true,
      auth: { userId: 'user-123', isAdmin: false, supabase: {} }
    });
    consumeAuthRateLimit.mockReset().mockResolvedValue(true);
    accountMaybeSingle.mockReset().mockResolvedValue({
      data: { auth_email: 'melody2251@users.invalid' },
      error: null
    });
    profileMaybeSingle.mockReset().mockResolvedValue({
      data: { username: 'melody2251' },
      error: null
    });
    signInWithPassword.mockReset().mockResolvedValue({ error: null });
    createClientMock.mockReset().mockReturnValue({
      auth: { signInWithPassword }
    });
    updateUserById.mockReset().mockResolvedValue({ error: null });
    securityEq.mockReset().mockResolvedValue({ error: null });
  });

  test('wrong current password -> 400 and does not update password', async () => {
    signInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' }
    });

    const res = await POST(
      passwordRequest({
        currentPassword: 'wrong-password',
        newPassword: 'brand-new-password'
      })
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Your current password is not right.' });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  test('same password -> 400 before rate limiting or verifying', async () => {
    const res = await POST(
      passwordRequest({
        currentPassword: 'same-password-123',
        newPassword: 'same-password-123'
      })
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Pick a new password that is different.' });
    expect(consumeAuthRateLimit).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
  });

  test('success -> 200 using non-persisting verifier and server-resolved auth email', async () => {
    const res = await POST(
      passwordRequest({
        currentPassword: 'old-password-123',
        newPassword: 'new-password-456',
        email: 'attacker@evil.example'
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(consumeAuthRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'password',
      'user-123',
      10
    );
    expect(createClientMock).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'anon-key-for-tests',
      expect.objectContaining({
        auth: expect.objectContaining({
          persistSession: false,
          autoRefreshToken: false
        })
      })
    );
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'melody2251@users.invalid',
      password: 'old-password-123'
    });
    expect(updateUserById).toHaveBeenCalledWith('user-123', {
      password: 'new-password-456'
    });
    expect(securityEq).toHaveBeenCalledWith('user_id', 'user-123');
  });

  test('rate limited -> 429 and does not verify or update', async () => {
    consumeAuthRateLimit.mockResolvedValue(false);

    const res = await POST(
      passwordRequest({
        currentPassword: 'old-password-123',
        newPassword: 'new-password-456'
      })
    );

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: 'Too many attempts. Try again in 15 minutes.'
    });
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
  });

  test('update failure hides raw Supabase error message from client', async () => {
    updateUserById.mockResolvedValue({
      error: { message: 'internal postgres auth failure detail' }
    });

    const res = await POST(
      passwordRequest({
        currentPassword: 'old-password-123',
        newPassword: 'new-password-456'
      })
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Could not change password. Please try again.'
    });
    expect(console.error).toHaveBeenCalled();
  });

  test('falls back to synthetic auth email from username when account_private email is missing', async () => {
    accountMaybeSingle.mockResolvedValue({ data: null, error: null });
    profileMaybeSingle.mockResolvedValue({ data: { username: 'ShopperOne' }, error: null });

    const res = await POST(
      passwordRequest({
        currentPassword: 'old-password-123',
        newPassword: 'new-password-456'
      })
    );

    expect(res.status).toBe(200);
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'shopperone@users.invalid',
      password: 'old-password-123'
    });
  });

  test('cross-origin POST is rejected with 403', async () => {
    const res = await POST(
      passwordRequest(
        { currentPassword: 'old-password-123', newPassword: 'new-password-456' },
        'https://evil.example'
      )
    );

    expect(res.status).toBe(403);
    expect(getWritableApiAuth).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
