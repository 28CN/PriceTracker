import { describe, expect, test } from 'vitest';

import {
  getPasswordValidityMessage,
  getUsernameValidityMessage,
  PASSWORD_LONG_MESSAGE,
  PASSWORD_SHORT_MESSAGE,
  USERNAME_INVALID_MESSAGE
} from './authValidation';

describe('getUsernameValidityMessage', () => {
  test('returns empty string for empty or valid usernames', () => {
    expect(getUsernameValidityMessage('', false)).toBe('');
    expect(getUsernameValidityMessage('alice', false)).toBe('');
    expect(getUsernameValidityMessage('Alice-99', false)).toBe('');
    expect(getUsernameValidityMessage('a-b', false)).toBe('');
    expect(getUsernameValidityMessage('admin', true)).toBe('');
  });

  test('returns friendly message for bad usernames', () => {
    expect(getUsernameValidityMessage('ab', false)).toBe(USERNAME_INVALID_MESSAGE);
    expect(getUsernameValidityMessage('-alice', false)).toBe(USERNAME_INVALID_MESSAGE);
    expect(getUsernameValidityMessage('alice-', false)).toBe(USERNAME_INVALID_MESSAGE);
    expect(getUsernameValidityMessage('alice_1', false)).toBe(USERNAME_INVALID_MESSAGE);
    expect(getUsernameValidityMessage(' alice', false)).toBe(USERNAME_INVALID_MESSAGE);
    expect(getUsernameValidityMessage('a'.repeat(31), false)).toBe(USERNAME_INVALID_MESSAGE);
  });

  test('reports reserved username on register when admin is not allowed', () => {
    expect(getUsernameValidityMessage('admin', false)).toBe('That username is reserved.');
    expect(getUsernameValidityMessage('login', false)).toBe('That username is reserved.');
  });
});

describe('getPasswordValidityMessage', () => {
  test('returns friendly message for short password on register', () => {
    expect(getPasswordValidityMessage('1234567', true)).toBe(PASSWORD_SHORT_MESSAGE);
    expect(getPasswordValidityMessage('12345678', true)).toBe('');
  });

  test('does not enforce minimum length on login', () => {
    expect(getPasswordValidityMessage('1234', false)).toBe('');
  });

  test('enforces maximum length', () => {
    expect(getPasswordValidityMessage('a'.repeat(73), true)).toBe(PASSWORD_LONG_MESSAGE);
    expect(getPasswordValidityMessage('a'.repeat(73), false)).toBe(PASSWORD_LONG_MESSAGE);
  });

  test('returns empty string for empty value so native required message applies', () => {
    expect(getPasswordValidityMessage('', true)).toBe('');
    expect(getPasswordValidityMessage('', false)).toBe('');
  });
});
