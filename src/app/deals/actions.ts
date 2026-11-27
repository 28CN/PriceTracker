'use server';

import { noteEatVisit } from '@/lib/eatRefresh';

export async function noteEatVisitAction() {
  try {
    await noteEatVisit();
  } catch {
    // Best-effort refresh trigger; ignore errors.
  }
}
