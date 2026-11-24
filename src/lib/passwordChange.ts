import { normalizeUsername, syntheticAuthEmail } from './username';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return 'Use at least 8 characters.';
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return 'Use no more than 72 characters.';
  }
  return null;
}

export type PasswordChangeInput = {
  currentPassword: string;
  newPassword: string;
  confirmPassword?: string;
};

export function validatePasswordChange(input: PasswordChangeInput): string | null {
  if (!input.currentPassword) {
    return 'Enter your current password.';
  }
  const passwordError = validatePassword(input.newPassword);
  if (passwordError) {
    return passwordError;
  }
  if (input.newPassword === input.currentPassword) {
    return 'Pick a new password that is different.';
  }
  if (input.confirmPassword !== undefined && input.newPassword !== input.confirmPassword) {
    return 'The new passwords do not match.';
  }
  return null;
}

export function resolveUserAuthEmail(
  storedAuthEmail: string | null | undefined,
  username: string | null | undefined
): string | null {
  const trimmedEmail = typeof storedAuthEmail === 'string' ? storedAuthEmail.trim() : '';
  if (trimmedEmail) return trimmedEmail;
  const normalized = normalizeUsername(username);
  if (normalized) return syntheticAuthEmail(normalized);
  return null;
}
