import { dispatchCrawl, type DispatchResult } from '@/lib/github/dispatch';
import { DEALS_WORKFLOW } from '@/lib/dealsRefresh';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export const PRICES_WORKFLOW = 'crawl-prices.yml';

export type Claim = { deals: boolean; prices: boolean; at: string };
export type Outcome = 'started' | 'not_due' | 'failed';

type Deps = {
  claim: () => Promise<Claim>;
  release: (task: 'prices', at: string) => Promise<void>;
  dispatchDeals: () => Promise<DispatchResult>;
  dispatchPrices: () => Promise<DispatchResult>;
};

const defaultDeps: Deps = {
  async claim() {
    const { data, error } = await createAdminSupabaseClient().rpc('claim_scheduled_work');
    if (error) throw new Error(error.message);
    return data as Claim;
  },
  async release(task, at) {
    const { error } = await createAdminSupabaseClient().rpc('release_scheduled_task', {
      p_task: task,
      p_claimed_at: at
    });
    if (error) throw new Error(error.message);
  },
  // The crawler re-checks should_run('schedule'), so a late or doubled tick only fetches when due.
  dispatchDeals: () => dispatchCrawl({ mode: 'schedule' }, { workflowId: DEALS_WORKFLOW }),
  dispatchPrices: () => dispatchCrawl({}, { workflowId: PRICES_WORKFLOW })
};

/** One hourly tick: start whatever the database says is due. Never throws. */
export async function runScheduledWork(deps: Deps = defaultDeps): Promise<{ deals: Outcome; prices: Outcome }> {
  let claim: Claim;
  try {
    claim = await deps.claim();
  } catch (error) {
    console.warn(`[scheduled] claim failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    return { deals: 'failed', prices: 'failed' };
  }

  const start = async (due: boolean, dispatch: () => Promise<DispatchResult>, name: string): Promise<Outcome> => {
    if (!due) return 'not_due';
    const result = await dispatch();
    if (result.ok) return 'started';
    console.warn(`[scheduled] ${name} not started: ${result.reason}${result.status ? ` ${result.status}` : ''}`);
    return 'failed';
  };

  const [deals, prices] = await Promise.all([
    start(claim.deals, deps.dispatchDeals, 'deals'),
    start(claim.prices, deps.dispatchPrices, 'prices')
  ]);
  if (prices === 'failed') {
    // Let the next hour (until 05:00 UTC) try again.
    await deps.release('prices', claim.at).catch(() => {});
  }
  return { deals, prices };
}
