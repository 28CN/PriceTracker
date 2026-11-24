/**
 * Pure motion helpers: easing, count-up interpolation, width reservation,
 * click-burst detection, and reduced-motion queries.
 */

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/** Smooth deceleration curve: fast start, gentle landing. */
export function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - (1 - x) ** 3;
}

/** Interpolate an integer between `from` and `to` for a 0..1 progress value. */
export function interpolateCount(
  from: number,
  to: number,
  progress: number,
  easing: (t: number) => number = easeOutCubic
): number {
  const safeFrom = Number.isFinite(from) ? from : 0;
  const safeTo = Number.isFinite(to) ? to : 0;
  const p = clamp01(progress);
  if (p <= 0) {
    const start = Math.round(safeFrom);
    return start === 0 ? 0 : start;
  }
  if (p >= 1) {
    const end = Math.round(safeTo);
    return end === 0 ? 0 : end;
  }
  const value = Math.round(safeFrom + (safeTo - safeFrom) * clamp01(easing(p)));
  return value === 0 ? 0 : value;
}

/** Character width in `ch` needed to hold the final integer without layout shift. */
export function minChForCount(value: number): number {
  const safe = Number.isFinite(value) ? Math.round(value) : 0;
  return Math.max(1, String(safe).length);
}

/** True when the user prefers reduced motion; safe on the server. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Sliding-window click counter (e.g. 3 clicks within 1.5 s). */
export function recordBurstClick(
  timestamps: readonly number[],
  now: number,
  windowMs = 1500,
  targetCount = 3
): { next: number[]; triggered: boolean } {
  const cutoff = now - windowMs;
  const recent = timestamps.filter((t) => t >= cutoff && t <= now);
  recent.push(now);
  if (recent.length >= targetCount) {
    return { next: [], triggered: true };
  }
  return { next: recent, triggered: false };
}

/** Stable sessionStorage key for a product's one-shot below-goal celebration. */
export function goalCelebrationKey(productId: string, price: number): string {
  const normalized = Number.isFinite(price) ? price.toFixed(2) : '0.00';
  return `pt:goal-burst:${productId}:${normalized}`;
}
