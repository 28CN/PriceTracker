import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const signOut = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { signOut } })
}));

const { GET, POST } = await import('./route.ts');

function req(method: string, origin?: string) {
  const headers: Record<string, string> = { cookie: 'sb-ref-auth-token=x; sb-ref-auth-token.1=y; theme=dark' };
  if (origin) headers.origin = origin;
  return new NextRequest('https://pt.example/demo/exit', { method, headers });
}

describe('/demo/exit', () => {
  beforeEach(() => signOut.mockReset().mockResolvedValue({ error: null }));

  test('POST signs out, clears auth cookies, 303 to /', async () => {
    const res = await POST(req('POST', 'https://pt.example'));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://pt.example/');
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    const cleared = res.cookies.getAll().filter((c) => c.value === '').map((c) => c.name).sort();
    expect(cleared).toEqual(['sb-ref-auth-token', 'sb-ref-auth-token.1']);
    expect(res.headers.get('cache-control')).toContain('no-store');
  });
  test('POST from another origin is rejected', async () => {
    const res = await POST(req('POST', 'https://evil.example'));
    expect(res.status).toBe(403);
    expect(signOut).not.toHaveBeenCalled();
  });
  test('still clears cookies and redirects if sign-out reports an error', async () => {
    signOut.mockResolvedValue({ error: { message: 'session not found' } });
    const res = await POST(req('POST', 'https://pt.example'));
    expect(res.status).toBe(303);
  });
  test('GET does not sign out', async () => {
    const res = await GET(req('GET'));
    expect(res.status).toBe(303);
    expect(signOut).not.toHaveBeenCalled();
  });
});
