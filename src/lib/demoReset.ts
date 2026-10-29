import { DEMO_AUTH_EMAIL, DEMO_USER_ID } from './demo.ts';

export type AdminAuthLike = {
  auth: {
    admin: {
      updateUserById: (
        id: string,
        attributes: { email?: string; password?: string; email_confirm?: boolean }
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
};

/**
 * Resets the demo user's password and email to the known values, so a demo
 * session that called auth.updateUser() cannot lock everyone else out.
 * Safe to run on every /demo hit. Returns false on any failure (fail closed).
 */
export async function resetDemoCredentials(
  admin: AdminAuthLike | null,
  password: string
): Promise<boolean> {
  if (!admin || !password) return false;
  try {
    const { error } = await admin.auth.admin.updateUserById(DEMO_USER_ID, {
      email: DEMO_AUTH_EMAIL,
      password,
      email_confirm: true
    });
    if (error) {
      console.error('[demo] could not reset demo credentials:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[demo] could not reset demo credentials:', error instanceof Error ? error.message : error);
    return false;
  }
}
