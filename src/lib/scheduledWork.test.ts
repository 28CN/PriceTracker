import { describe, expect, it, vi } from 'vitest';

import { runScheduledWork } from './scheduledWork';

const ok = async () => ({ ok: true as const });
const refused = async () => ({ ok: false as const, reason: 'HTTP_ERROR' as const, status: 403, message: 'no' });
const at = '2026-11-30T03:00:00Z';

describe('runScheduledWork', () => {
  it('starts only what the database claimed', async () => {
    const dispatchDeals = vi.fn(ok);
    const dispatchPrices = vi.fn(ok);
    const release = vi.fn(async () => {});
    const result = await runScheduledWork({
      claim: async () => ({ deals: true, prices: false, at }),
      release,
      dispatchDeals,
      dispatchPrices
    });
    expect(result).toEqual({ deals: 'started', prices: 'not_due' });
    expect(dispatchDeals).toHaveBeenCalledTimes(1);
    expect(dispatchPrices).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it('releases the price claim when GitHub refuses, so the next hour retries', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const release = vi.fn(async () => {});
    const result = await runScheduledWork({
      claim: async () => ({ deals: false, prices: true, at }),
      release,
      dispatchDeals: ok,
      dispatchPrices: refused
    });
    expect(result).toEqual({ deals: 'not_due', prices: 'failed' });
    expect(release).toHaveBeenCalledWith('prices', at);
  });

  it('never throws when the claim fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await runScheduledWork({
      claim: async () => {
        throw new Error('down');
      },
      release: async () => {},
      dispatchDeals: ok,
      dispatchPrices: ok
    });
    expect(result).toEqual({ deals: 'failed', prices: 'failed' });
  });
});
