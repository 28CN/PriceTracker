import { createClient } from '@supabase/supabase-js';

import { dispatchCrawl, type DispatchResult } from '@/lib/github/dispatch';
import { getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/config';

export const DEALS_WORKFLOW = 'fetch-deals.yml';

type Deps = {
  noteVisit: () => Promise<boolean>;
  dispatch: () => Promise<DispatchResult>;
};

const defaultDeps: Deps = {
  // Anonymous client: the RPC is granted to anon, and this runs after the
  // response, where request cookies are no longer available.
  async noteVisit() {
    const supabase = createClient(getSupabaseUrl(), getSupabasePublishableKey(), {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await supabase.rpc('note_deals_visit');
    if (error) throw new Error(error.message);
    return data === true;
  },
  dispatch: () => dispatchCrawl({ mode: 'visit' }, { workflowId: DEALS_WORKFLOW })
};

/**
 * Called after a /deals page is sent. The database records the visit and says
 * whether a fetch is due (last run 55+ min ago, at most one ask per 20 min);
 * if so, the deals workflow is started. Never throws.
 */
export async function noteDealsVisit(deps: Deps = defaultDeps): Promise<'started' | 'not_due' | 'failed'> {
  try {
    if (!(await deps.noteVisit())) return 'not_due';
    const result = await deps.dispatch();
    if (!result.ok) {
      console.warn(`[deals] refresh not started: ${result.reason}`);
      return 'failed';
    }
    return 'started';
  } catch (error) {
    console.warn(`[deals] visit not noted: ${error instanceof Error ? error.message : 'unknown error'}`);
    return 'failed';
  }
}
