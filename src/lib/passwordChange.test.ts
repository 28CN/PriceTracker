import { describe, expect, test } from 'vitest';

import {
  resolveUserAuthEmail,
  validatePassword,
  validatePasswordChange
} from './passwordChange';

describe('validatePassword', () => {
  test('rejects short and non-string passwords', () => {
    expect(validatePassword('')).toBe('Use at least 8 characters.');
    expect(validatePassword('1234567')).toBe('Use at least 8 characters.');
    expect(validatePassword(null)).toBe('Use at least 8 characters.');
  });

  test('rejects passwords longer than 72 characters', () => {
    expect(validatePassword('a'.repeat(73))).toBe('Use no more than 72 characters.');
  });

  test('accepts 8 to 72 characters', () => {
    expect(validatePassword('12345678')).toBeNull();
    expect(validatePassword('a'.repeat(72))).toBeNull();
  });
});

describe('validatePasswordChange', () => {
  test('requires current password', () => {
    expect(
      validatePasswordChange({
        currentPassword: '',
        newPassword: 'new-password-123'
      })
    ).toBe('Enter your current password.');
  });

  test('validates new password length', () => {
    expect(
      validatePasswordChange({
        currentPassword: 'old-password-123',
        newPassword: 'short'
      })
    ).toBe('Use at least 8 characters.');

    expect(
      validatePasswordChange({
        currentPassword: 'old-password-123',
        newPassword: 'x'.repeat(73)
      })
    ).toBe('Use no more than 72 characters.');
  });

  test('rejects reusing the current password', () => {
    expect(
      validatePasswordChange({
        currentPassword: 'same-password-123',
        newPassword: 'same-password-123'
      })
    ).toBe('Pick a new password that is different.');
  });

  test('rejects mismatched confirmation when provided', () => {
    expect(
      validatePasswordChange({
        currentPassword: 'old-password-123',
        newPassword: 'new-password-123',
        confirmPassword: 'other-password-123'
      })
    ).toBe('The new passwords do not match.');
  });

  test('accepts valid change with or without confirmPassword', () => {
    expect(
      validatePasswordChange({
        currentPassword: 'old-password-123',
        newPassword: 'new-password-123'
      })
    ).toBeNull();

    expect(
      validatePasswordChange({
        currentPassword: 'old-password-123',
        newPassword: 'new-password-123',
        confirmPassword: 'new-password-123'
      })
    ).toBeNull();
  });
});

describe('resolveUserAuthEmail', () => {
  test('prefers stored auth email when present', () => {
    expect(resolveUserAuthEmail('melody@users.invalid', 'other')).toBe('melody@users.invalid');
    expect(resolveUserAuthEmail('  admin@example.com  ', 'admin')).toBe('admin@example.com');
  });

  test('falls back to syntheticAuthEmail when stored email is missing', () => {
    expect(resolveUserAuthEmail(null, 'Melody2251')).toBe('melody2251@users.invalid');
    expect(resolveUserAuthEmail('', '  shopper-1  ')).toBe('shopper-1@users.invalid');
  });

  test('returns null when both are missing', () => {
    expect(resolveUserAuthEmail(null, null)).toBeNull();
    expect(resolveUserAuthEmail('   ', '   ')).toBeNull();
  });
});
