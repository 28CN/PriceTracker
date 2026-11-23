import { describe, expect, it } from 'vitest';
import { formatCheckedAt, formatLastSeen } from './format';

describe('formatCheckedAt', () => {
  it('does not invent a queued check when there is no date', () => {
    expect(formatCheckedAt(null)).toBe('');
    expect(formatCheckedAt('not-a-date')).toBe('');
  });

  it('includes the weekday and year in Sydney time', () => {
    // 2026-11-04 01:00 UTC is Wednesday 4 November 2026 in Sydney (AEDT, UTC+11).
    expect(formatCheckedAt('2026-11-04T01:00:00.000Z')).toBe('Wed, 4 Nov 2026');
  });
});

describe('formatLastSeen', () => {
  const now = new Date('2026-11-23T00:00:00.000Z');

  it('returns empty string for missing or invalid dates', () => {
    expect(formatLastSeen(null, now)).toBe('');
    expect(formatLastSeen(undefined, now)).toBe('');
    expect(formatLastSeen('not-a-date', now)).toBe('');
  });

  it('shows short day and month in Sydney time for the current year', () => {
    expect(formatLastSeen('2026-11-04T01:00:00.000Z', now)).toBe('4 Nov');
  });

  it('adds the year when the observation is in a different Sydney year', () => {
    expect(formatLastSeen('2025-11-04T01:00:00.000Z', now)).toBe('4 Nov 2025');
  });

  it('uses Sydney time around the New Year boundary', () => {
    // 2026-12-31T14:00:00Z is 2027-01-01 01:00 in Sydney (AEDT, UTC+11).
    const sydneyNewYear = new Date('2026-12-31T14:00:00.000Z');
    expect(formatLastSeen('2026-11-04T01:00:00.000Z', sydneyNewYear)).toBe('4 Nov 2026');
    expect(formatLastSeen('2026-12-31T14:00:00.000Z', new Date('2027-01-15T00:00:00.000Z'))).toBe('1 Jan');
  });
});
