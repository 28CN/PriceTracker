import { describe, expect, it } from 'vitest';
import { formatCheckedAt } from './format';

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
