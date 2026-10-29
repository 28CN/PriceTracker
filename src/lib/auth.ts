import { createHash } from 'node:crypto';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';

import { createAdminSupabaseClient } from './supabase/admin';
import { createServerSupabaseClient } from './supabase/server';
import { normalizeUsername, validateUsername } from './username';

export { normalizeUsername, validateUsername };

export type Viewer = {
  id: string;
  username: string;
  displayName: string | null;
  avatarPath: string | null;
  publicSlug: string | null;
  watchlistPublic: boolean;
  isAdmin: boolean;
  mustChangePassword: boolean;
  isDemo: boolean;
};

export async function getApiAuth() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== 'string') return null;

  const { data: adminResult } = await supabase.rpc('is_admin');
  return { supabase, userId, isAdmin: adminResult === true };
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Use at least 8 characters.';
  }
  if (password.length > 72) {
    return 'Use no more than 72 characters.';
  }
  return null;
}

export function syntheticAuthEmail(username: string): string {
  return `${username}@users.invalid`;
}

export function assertSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

export async function consumeAuthRateLimit(
  request: NextRequest,
  action: 'login' | 'register' | 'recover',
  identifier: string,
  attemptLimit: number
): Promise<boolean> {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const address = forwarded || request.headers.get('x-real-ip') || 'unknown';
  const pepper = process.env.AUTH_RATE_LIMIT_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const keyHash = createHash('sha256')
    .update(`${pepper}:${address}:${identifier}`)
    .digest('hex');

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc('consume_auth_rate_limit', {
    candidate_key_hash: keyHash,
    candidate_action: action,
    attempt_limit: attemptLimit,
    window_seconds: 900
  });

  if (error) {
    console.error('[auth] rate limiter unavailable:', error.message);
    return false;
  }
  return data === true;
}

export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== 'string') return null;

  const profileResult = await supabase
    .from('profiles')
    .select('username, display_name, avatar_path, public_slug, watchlist_visibility, is_demo')
    .eq('id', userId)
    .maybeSingle();
  const profileQuery =
    profileResult.error && /public_slug/.test(profileResult.error.message)
      ? await supabase
          .from('profiles')
          .select('username, display_name, avatar_path, watchlist_visibility')
          .eq('id', userId)
          .maybeSingle()
      : profileResult;

  const [{ data: roles }, { data: security }] = await Promise.all([
    supabase.from('user_roles').select('role').eq('user_id', userId),
    supabase
      .from('user_security')
      .select('must_change_password')
      .eq('user_id', userId)
      .maybeSingle()
  ]);

  const profile = profileQuery.data as {
    username: string;
    display_name: string | null;
    avatar_path: string | null;
    watchlist_visibility?: string | null;
    public_slug?: string | null;
    is_demo?: boolean | null;
  } | null;
  if (profileQuery.error || !profile) return null;
  return {
    id: userId,
    username: profile.username,
    displayName: profile.display_name,
    avatarPath: profile.avatar_path,
    publicSlug: typeof profile.public_slug === 'string' ? profile.public_slug : null,
    watchlistPublic: profile.watchlist_visibility === 'public',
    isAdmin: (roles || []).some((row) => row.role === 'admin'),
    mustChangePassword: security?.must_change_password === true,
    isDemo: profile.is_demo === true
  };
}

export async function requireViewer(returnTo = '/manage'): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) {
    redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  }
  if (viewer.mustChangePassword && returnTo !== '/account') {
    redirect('/account?security=required');
  }
  return viewer;
}
