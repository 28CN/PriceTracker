import { describe, expect, it } from 'vitest';

import { WEEKLY_DEALS, perthDay, weekFor } from './weekly';

describe('weekFor', () => {
  it('runs Monday to Sunday in Perth time with today and tomorrow marked', () => {
    // Friday 27 Nov 2026, 11:00 in Perth.
    const week = weekFor(Date.parse('2026-11-27T03:00:00Z'));
    expect(week.map((d) => d.short)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(week.find((d) => d.isToday)?.date).toBe('2026-11-27');
    expect(week.find((d) => d.isTomorrow)?.label).toBe('Saturday');
    expect(week[0].date).toBe('2026-11-23');
    expect(week[1].deals.map((d) => d.id)).toEqual(['dominos-tuesyay']);
    expect(week[5].deals.map((d) => d.id)).toEqual(['dominos-super-saturday']);
  });

  it('uses Perth, not UTC, near midnight', () => {
    // 17:30 UTC Sunday = 01:30 Monday in Perth.
    expect(perthDay(Date.parse('2026-11-29T17:30:00Z'))).toEqual({ day: 1, date: '2026-11-30' });
    const week = weekFor(Date.parse('2026-11-29T17:30:00Z'));
    expect(week[0].isToday && week[1].isTomorrow).toBe(true);
  });

  it('has a source and a checked date on every deal', () => {
    for (const deal of WEEKLY_DEALS) {
      expect(deal.sources.length).toBeGreaterThan(0);
      for (const s of deal.sources) expect(s.url).toMatch(/^https:\/\//);
      expect(deal.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
