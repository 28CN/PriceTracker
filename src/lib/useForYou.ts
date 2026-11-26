'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { ForYouItem } from '@/lib/dealsForYou';

export type ForYou = { count: number; items: ForYouItem[] };

const EMPTY: ForYou = { count: 0, items: [] };
const FRESH_MS = 5 * 60_000;

// One request per few minutes, shared by both navs and the dashboard card.
let pending: Promise<ForYou> | null = null;
let fetchedAt = 0;

function load(): Promise<ForYou> {
  if (!pending || Date.now() - fetchedAt > FRESH_MS) {
    fetchedAt = Date.now();
    pending = fetch('/api/deals/for-you', { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<ForYou>) : EMPTY))
      .catch(() => EMPTY);
  }
  return pending;
}

/** New deals for you since your last Deals visit; cleared while on Deals. */
export function useForYou(enabled: boolean): ForYou | null {
  const pathname = usePathname() || '/';
  const [data, setData] = useState<ForYou | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (pathname.startsWith('/deals')) {
      pending = Promise.resolve(EMPTY);
      fetchedAt = Date.now();
      setData(EMPTY);
      return;
    }
    let live = true;
    load().then((result) => {
      if (live) setData(result);
    });
    return () => {
      live = false;
    };
  }, [enabled, pathname]);

  return data;
}
