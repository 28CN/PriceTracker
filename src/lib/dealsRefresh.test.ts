import { describe, expect, it, vi } from 'vitest';

import { noteDealsVisit } from './dealsRefresh';

describe('noteDealsVisit', () => {
  it('starts the deals job only when the database says a fetch is due', async () => {
    const dispatch = vi.fn(async () => ({ ok: true as const }));
    expect(await noteDealsVisit({ noteVisit: async () => true, dispatch })).toBe('started');
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(await noteDealsVisit({ noteVisit: async () => false, dispatch })).toBe('not_due');
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('never throws when the database or GitHub fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      await noteDealsVisit({
        noteVisit: async () => {
          throw new Error('down');
        },
        dispatch: async () => ({ ok: true })
      })
    ).toBe('failed');
    expect(
      await noteDealsVisit({
        noteVisit: async () => true,
        dispatch: async () => ({
          ok: false,
          reason: 'HTTP_ERROR',
          status: 403,
          message: 'x'
        })
      })
    ).toBe('failed');
    warn.mockRestore();
  });
});
