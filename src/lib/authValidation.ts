import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './passwordChange';
import { normalizeUsername, validateUsername } from './username';

export const USERNAME_INVALID_MESSAGE =
  'Use 3 to 30 letters, numbers or hyphens. Start and end with a letter or number.';
export const PASSWORD_SHORT_MESSAGE = 'Use at least 8 characters.';
export const PASSWORD_LONG_MESSAGE = 'Use no more than 72 characters.';

export function getUsernameValidityMessage(rawValue: string, allowAdmin: boolean): string {
  if (!rawValue) return '';
  if (rawValue !== rawValue.trim()) return USERNAME_INVALID_MESSAGE;
  const error = validateUsername(normalizeUsername(rawValue), allowAdmin);
  if (!error) return '';
  if (error === 'That username is reserved.') return error;
  return USERNAME_INVALID_MESSAGE;
}

export function getPasswordValidityMessage(
  rawValue: string,
  requireMinLength: boolean
): string {
  if (!rawValue) return '';
  if (requireMinLength && rawValue.length < PASSWORD_MIN_LENGTH) {
    return PASSWORD_SHORT_MESSAGE;
  }
  if (rawValue.length > PASSWORD_MAX_LENGTH) {
    return PASSWORD_LONG_MESSAGE;
  }
  return '';
}

export function readCapsLock(event: {
  getModifierState?: (key: 'CapsLock') => boolean;
}): boolean {
  return typeof event.getModifierState === 'function'
    ? event.getModifierState('CapsLock')
    : false;
}

/** Where to go after signing in: same-site paths only, never another site. */
export function safeNextPath(value: string | null | undefined): string {
  // Browsers read "/\x" like "//x", which is another site.
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  return value;
}
