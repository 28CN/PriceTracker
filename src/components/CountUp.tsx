'use client';

import { useEffect, useRef, useState } from 'react';

import { interpolateCount, minChForCount, prefersReducedMotion } from '@/lib/motion';

const DEFAULT_DURATION_MS = 600;

/**
 * Counts smoothly from 0 on first mount (and from the previous displayed value
 * on later updates) to `value`. Falls back immediately under reduced motion.
 */
export function useCountUp(value: number, durationMs = DEFAULT_DURATION_MS): number {
  const target = Number.isFinite(value) ? Math.round(value) : 0;
  const [display, setDisplay] = useState(target);
  const hasMountedRef = useRef(false);
  const currentRef = useRef(target);

  useEffect(() => {
    const isFirst = !hasMountedRef.current;
    hasMountedRef.current = true;

    const from = isFirst ? 0 : currentRef.current;

    if (prefersReducedMotion() || from === target || durationMs <= 0) {
      currentRef.current = target;
      setDisplay(target);
      return;
    }

    let rafId = 0;
    let startTime: number | null = null;
    currentRef.current = from;
    setDisplay(from);

    const step = (now: number) => {
      if (startTime === null) startTime = now;
      const progress = (now - startTime) / durationMs;
      const next = interpolateCount(from, target, progress);
      if (next !== currentRef.current) {
        currentRef.current = next;
        setDisplay(next);
      }
      if (progress < 1) {
        rafId = window.requestAnimationFrame(step);
      } else {
        currentRef.current = target;
        setDisplay(target);
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
  }, [target, durationMs]);

  return display;
}

export default function CountUp({
  value,
  durationMs = DEFAULT_DURATION_MS
}: {
  value: number;
  durationMs?: number;
}) {
  const target = Number.isFinite(value) ? Math.round(value) : 0;
  const display = useCountUp(target, durationMs);
  const minCh = minChForCount(target);

  return (
    <span className="count-up">
      <span className="sr-only">{target}</span>
      <span
        className="count-up-value"
        aria-hidden="true"
        style={{ minWidth: `${minCh}ch` }}
      >
        {display}
      </span>
    </span>
  );
}
