import { describe, expect, it } from 'vitest';

import { serverTimingHeader } from './serverTiming';

describe('serverTimingHeader', () => {
  it('names auth, the list query, and render', () => {
    expect(serverTimingHeader({ auth: 12.4, list: 40, render: 3.2 })).toBe(
      'auth;dur=12, list;dur=40, render;dur=3'
    );
  });
});
