import { createHash } from 'node:crypto';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';

import { createAdminSupabaseClient } from './supabase/admin';
import { createServerSupabaseClient } from './supabase/server';

const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;
const RESERVED_USERNAMES = new Set([
  'account',
  'admin',
  'api',
  'auth',
  'forgot-password',
  'login',
  'logout',
  'manage',
  'privacy',
  'register',
  'reset-password',
  'security',
  'settings',
  'signup',
  'support',
  'unsubscribe',
  'verify-email',
  'www'
]);

export type Viewer = {
  id: string;
  username: string;
  displayName: string | null;
  avatarPath: string | null;
  isAdmin: boolean;
  mustChangePassword: boolean;
};

export async function getApiAuth() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== 'string') return null;

  const { data: adminResult } = await supabase.rpc('is_admin');
  return { supabase, userId, isAdmin: adminResult === true };
}

export function normalizeUsername(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validateUsername(username: string, allowAdmin = false): string | null {
  if (!USERNAME_PATTERN.test(username)) {
    return 'Use 3–30 lowercase letters, numbers or single hyphens.';
  }
  if (RESERVED_USERNAMES.has(username) && !(allowAdmin && username === 'admin')) {
    return 'That username is reserved.';
  }
  return null;
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

  const [{ data: profile }, { data: roles }, { data: security }] = await Promise.all([
    supabase
      .from('profiles')
      .select('username, display_name, avatar_path')
      .eq('id', userId)
      .maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', userId),
    supabase
      .from('user_security')
      .select('must_change_password')
      .eq('user_id', userId)
      .maybeSingle()
  ]);

  if (!profile) return null;
  return {
    id: userId,
    username: profile.username,
    displayName: profile.display_name,
    avatarPath: profile.avatar_path,
    isAdmin: (roles || []).some((row) => row.role === 'admin'),
    mustChangePassword: security?.must_change_password === true
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
