/** Supermarket specials turn over weekly, so older readings are not shown as current. */
export const PRICE_FRESH_DAYS = 7;
const PRICE_FRESH_MS = PRICE_FRESH_DAYS * 24 * 60 * 60 * 1000;

export function isStaleCheckedAt(iso: string | null | undefined, now = Date.now()): boolean {
  if (!iso) return true;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return true;
  return now - then > PRICE_FRESH_MS;
}
