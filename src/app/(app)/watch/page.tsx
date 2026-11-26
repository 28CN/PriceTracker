import type { Metadata } from 'next';

import InfoTip from '@/components/InfoTip';
import PriceWatch from '@/components/PriceWatch';
import { requireViewer } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadWatch, type WatchView } from '@/lib/watchData';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export const metadata: Metadata = {
  title: 'Price watch · PriceTracker',
  robots: { index: false, follow: false }
};

export default async function WatchPage() {
  const viewer = await requireViewer('/watch');
  const supabase = await createServerSupabaseClient();

  let view: WatchView | null = null;
  let loadError = false;
  try {
    view = await loadWatch(supabase, viewer.id);
  } catch {
    loadError = true;
  }

  return (
    <main className="watch-page">
      <header className="watch-head">
        <h1 className="watch-title">
          Price watch
          <InfoTip label="About Price watch">
            From your saved price history. Sale rhythms need a few months of checks.
          </InfoTip>
        </h1>
      </header>

      {loadError || !view ? (
        <div className="alert" role="alert">
          Could not load prices. Try again.
        </div>
      ) : (
        <PriceWatch view={view} />
      )}
    </main>
  );
}
