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

// Price checks are weekly, so the weekday and date matter more than "3d ago".
export function formatCheckedAt(iso: string | null | undefined): string {
  if (!iso) {
    return 'not checked yet';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'unknown';
  }

  return date.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
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
