import { createClient } from '@supabase/supabase-js';

import { DEALS_WORKFLOW } from '@/lib/dealsRefresh';
import { dispatchCrawl, type DispatchResult } from '@/lib/github/dispatch';
import { getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/config';

type Deps = {
  noteVisit: () => Promise<boolean>;
  dispatch: () => Promise<DispatchResult>;
};

const defaultDeps: Deps = {
  async noteVisit() {
    const supabase = createClient(getSupabaseUrl(), getSupabasePublishableKey(), {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await supabase.rpc('note_eat_visit');
    if (error) throw new Error(error.message);
    return data === true;
  },
  // Only the fast-food feeds (crawler/eat.py), not the /deals shop feeds.
  dispatch: () => dispatchCrawl({ mode: 'visit', scope: 'food' }, { workflowId: DEALS_WORKFLOW })
};

/**
 * Called after /eat is sent. The database notes the visit and says whether
 * the food feeds are due (last fetch 30+ min ago, one ask per 20 min). Never throws.
 */
export async function noteEatVisit(deps: Deps = defaultDeps): Promise<'started' | 'not_due' | 'failed'> {
  try {
    if (!(await deps.noteVisit())) return 'not_due';
    const result = await deps.dispatch();
    if (!result.ok) {
      console.warn(`[eat] refresh not started: ${result.reason}`);
      return 'failed';
    }
    return 'started';
  } catch (error) {
    console.warn(`[eat] visit not noted: ${error instanceof Error ? error.message : 'unknown error'}`);
    return 'failed';
  }
}
