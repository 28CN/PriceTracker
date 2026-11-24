'use client';

import { ChartNoAxesCombined } from 'lucide-react';
import Link from 'next/link';
import { type MouseEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { prefersReducedMotion, recordBurstClick } from '@/lib/motion';

const CLICK_WINDOW_MS = 1500;
const CLICK_COUNT = 3;
const HOP_DURATION_MS = 1650;

export default function BrandLogo() {
  const [hopping, setHopping] = useState(false);
  const clicksRef = useRef<number[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }

    const onHome = typeof window !== 'undefined' && window.location.pathname === '/';
    if (onHome) {
      event.preventDefault();
    }

    if (prefersReducedMotion() || hopping) return;

    const result = recordBurstClick(clicksRef.current, Date.now(), CLICK_WINDOW_MS, CLICK_COUNT);
    clicksRef.current = result.next;
    if (!result.triggered) return;

    setHopping(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setHopping(false);
    }, HOP_DURATION_MS);
  }

  return (
    <>
      <Link href="/" className="brand-link" aria-label="PriceTracker home" onClick={handleClick}>
        <span className="brand-mark" aria-hidden="true">
          <ChartNoAxesCombined size={21} />
        </span>
        <p className="brand">
          Price<span>Tracker</span>
        </p>
      </Link>
      {hopping && typeof document !== 'undefined'
        ? createPortal(
            <div className="roo-easter-stage" aria-hidden="true">
              <div className="roo-easter-track">
                <div className="roo-easter-hop">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local static SVG illustration */}
                  <img
                    src="/illustrations/kangaroo.svg"
                    alt=""
                    width={40}
                    height={40}
                    className="roo-easter-img"
                    decoding="async"
                  />
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
