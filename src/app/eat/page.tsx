import type { Metadata } from 'next';
import { after } from 'next/server';

import EatBoard from '@/components/EatBoard';
import InfoTip from '@/components/InfoTip';
import { EAT_CHAINS } from '@/lib/eat/chains';
import { loadEatDeals } from '@/lib/eat/eatDeals';
import { WEEKLY_CHECKED, weekFor } from '@/lib/eat/weekly';
import { noteEatVisit } from '@/lib/eatRefresh';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export const metadata: Metadata = {
  title: 'Eat · PriceTracker',
  description: "Today's fast-food deals in Perth: KFC, Hungry Jack's, Domino's, Red Rooster, Chicken Treat and more."
};

export default async function EatPage() {
  // After the page is sent: note the visit, and fetch fresh food deals if due.
  after(() => noteEatVisit());
  const now = Date.now();
  const supabase = await createServerSupabaseClient();
  const data = await loadEatDeals(supabase, now);

  return (
    <main className="eat-page">
      <header className="eat-head">
        <h1 className="eat-title">
          Eat
          <InfoTip label="About Eat">
            Fast-food deals valid in WA, from OzBargain. Weekly deals checked by hand on the chains&apos; own pages.
          </InfoTip>
        </h1>
      </header>
      <EatBoard
        groups={data.groups}
        updated={data.updated}
        loadFailed={data.failed}
        week={weekFor(now)}
        weeklyChecked={WEEKLY_CHECKED}
        chains={EAT_CHAINS}
      />
    </main>
  );
}
