/**
 * Weekly deals that come back on the same day, checked by hand on the chains'
 * own pages. Edit here; keep `checked` and the source links current.
 * Days are ISO weekdays in Perth time: 1 = Monday ... 7 = Sunday.
 */
export type WeeklyDeal = {
  id: string;
  chain: string;
  day: number | 'daily';
  title: string;
  detail: string;
  app?: boolean;
  sources: { label: string; url: string }[];
  checked: string;
};

export const WEEKLY_CHECKED = '2026-11-27';

export const WEEKLY_DEALS: WeeklyDeal[] = [
  {
    id: 'dominos-tuesyay',
    chain: 'dominos',
    day: 2,
    title: 'Tuesyay',
    detail: 'Large pizza pick-up deals, selected stores',
    sources: [
      { label: "Domino's terms", url: 'https://www.dominos.com.au/landing-pages/pizza-perks-terms-conditions/' },
      { label: "Domino's offers", url: 'https://www.dominos.com.au/offers' }
    ],
    checked: WEEKLY_CHECKED
  },
  {
    id: 'kfc-wicked-wednesday',
    chain: 'kfc',
    day: 3,
    title: 'Wicked Wednesday',
    detail: 'Changes each week, app or web pick-up',
    app: true,
    sources: [{ label: 'KFC promos', url: 'https://www.kfc.com.au/promos-rewards' }],
    checked: WEEKLY_CHECKED
  },
  {
    id: 'dominos-super-saturday',
    chain: 'dominos',
    day: 6,
    title: 'Super Saturday',
    detail: 'Buy a large Traditional or Premium, second large from $1, pick-up',
    sources: [
      { label: "Domino's terms", url: 'https://www.dominos.com.au/landing-pages/pizza-perks-terms-conditions/' },
      { label: "Domino's offers", url: 'https://www.dominos.com.au/offers' }
    ],
    checked: WEEKLY_CHECKED
  },
  {
    id: 'hj-shake-and-win',
    chain: 'hungryjacks',
    day: 'daily',
    title: 'Shake & Win',
    detail: 'Two shakes a day in the app, prize lasts 30 min',
    app: true,
    sources: [{ label: "Hungry Jack's vouchers", url: 'https://www.hungryjacks.com.au/vouchers' }],
    checked: WEEKLY_CHECKED
  }
];

export type WeekDay = {
  day: number;
  label: string;
  short: string;
  date: string;
  isToday: boolean;
  isTomorrow: boolean;
  deals: WeeklyDeal[];
};

const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Perth's ISO weekday and date (YYYY-MM-DD) for a moment. */
export function perthDay(now: number): { day: number; date: string } {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Perth',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(now));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 1;
  return { day, date: `${get('year')}-${get('month')}-${get('day')}` };
}

/** Monday to Sunday of this Perth week, with today and tomorrow marked. */
export function weekFor(now: number, deals: WeeklyDeal[] = WEEKLY_DEALS): WeekDay[] {
  const today = perthDay(now);
  const tomorrow = today.day === 7 ? 1 : today.day + 1;
  return NAMES.map((label, index) => {
    const day = index + 1;
    const date = perthDay(now + (day - today.day) * 86_400_000).date;
    return {
      day,
      label,
      short: label.slice(0, 3),
      date,
      isToday: day === today.day,
      isTomorrow: day === tomorrow,
      deals: deals.filter((deal) => deal.day === day)
    };
  });
}
