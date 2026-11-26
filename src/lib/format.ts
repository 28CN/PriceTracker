const moneyFormatter = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD'
});

export function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatMoney(value: number | string | null | undefined): string {
  const parsed = toNumber(value);
  return parsed === null ? '--' : moneyFormatter.format(parsed);
}

// Short relative wording keeps the mobile layout on a single line.
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) {
    return 'never';
  }

  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return 'unknown';
  }

  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(then).toLocaleDateString('en-AU');
}

const sydneyYearFormatter = new Intl.DateTimeFormat('en-AU', {
  year: 'numeric',
  timeZone: 'Australia/Sydney'
});

const sydneyDayMonthFormatter = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Australia/Sydney'
});

const sydneyDayMonthYearFormatter = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Australia/Sydney'
});

const sydneyDatePartsFormatter = new Intl.DateTimeFormat('en-AU', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Australia/Sydney'
});

function sydneyDayNumber(date: Date): number {
  const parts = sydneyDatePartsFormatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

// Price checks are weekly. Show the calendar date in Sydney, with the year,
// so an old check is not mistaken for this week. No date is not a promise
// that a check is queued — callers decide that from crawl job status.
export function formatCheckedAt(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Australia/Sydney'
  }).format(date);
}

/**
 * Compact Sydney-day label for recent price checks: "Today", "Yesterday",
 * "3 days ago" (2–6 days), otherwise short date ("25 Nov", or with year if older).
 */
export function formatCheckedShort(
  iso: string | null | undefined,
  now: Date | number = Date.now()
): string {
  if (!iso) {
    return '';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const ref = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(ref.getTime())) {
    return '';
  }

  const diffDays = sydneyDayNumber(ref) - sydneyDayNumber(date);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays >= 2 && diffDays <= 6) return `${diffDays} days ago`;

  return formatLastSeen(iso, ref);
}

/**
 * Short Sydney calendar date for stale prices: "4 Nov", adding the year
 * ("4 Nov 2025") only when it differs from the current Sydney year.
 */
export function formatLastSeen(
  iso: string | null | undefined,
  now: Date | number = Date.now()
): string {
  if (!iso) {
    return '';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const ref = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(ref.getTime())) {
    return '';
  }

  if (sydneyYearFormatter.format(date) === sydneyYearFormatter.format(ref)) {
    return sydneyDayMonthFormatter.format(date);
  }
  return sydneyDayMonthYearFormatter.format(date);
}

export function latestTimestamp(values: (string | null)[]): string | null {
  let newest: string | null = null;
  let newestMs = -Infinity;

  for (const value of values) {
    if (!value) continue;
    const ms = new Date(value).getTime();
    if (!Number.isNaN(ms) && ms > newestMs) {
      newestMs = ms;
      newest = value;
    }
  }

  return newest;
}
