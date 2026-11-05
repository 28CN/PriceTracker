import { describe, expect, it } from 'vitest';
import { formatCheckedAt } from './format';

describe('formatCheckedAt', () => {
  it('says checking soon without a date', () => {
    expect(formatCheckedAt(null)).toBe('checking soon');
  });
});
