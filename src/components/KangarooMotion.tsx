'use client';

import { useEffect, useRef, useState, type AnimationEvent } from 'react';

const ROUTES = 4;
const STILL_SRC = '/illustrations/kangaroo-still.webp';
const GIF_SRC = '/illustrations/kangaroo.gif';

type IdleWindow = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export default function KangarooMotion() {
  const travelRef = useRef<HTMLDivElement>(null);
  const shelfRef = useRef<HTMLElement | null>(null);
  const [pass, setPass] = useState(0);
  const [isInView, setIsInView] = useState(false);
  const [isTabVisible, setIsTabVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isGifReady, setIsGifReady] = useState(false);

  useEffect(() => {
    shelfRef.current = travelRef.current?.closest<HTMLElement>('.shelf') ?? null;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => setReducedMotion(media.matches);
    syncMotion();
    media.addEventListener('change', syncMotion);

    const syncVisibility = () => setIsTabVisible(document.visibilityState !== 'hidden');
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);

    const shelf = shelfRef.current;
    let observer: IntersectionObserver | null = null;
    if (shelf && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          setIsInView(Boolean(entries[0]?.isIntersecting));
        },
        { threshold: 0.05 }
      );
      observer.observe(shelf);
    } else {
      setIsInView(true);
    }

    return () => {
      media.removeEventListener('change', syncMotion);
      document.removeEventListener('visibilitychange', syncVisibility);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (isGifReady || reducedMotion || !isInView || !isTabVisible) return;

    let cancelled = false;
    let idleId: number | null = null;
    let timeoutId: number | null = null;
    const win = window as IdleWindow;

    const loadGif = () => {
      if (cancelled) return;
      const preload = new Image();
      preload.decoding = 'async';
      preload.onload = () => {
        if (!cancelled) setIsGifReady(true);
      };
      preload.src = GIF_SRC;
    };

    if (typeof win.requestIdleCallback === 'function') {
      idleId = win.requestIdleCallback(loadGif, { timeout: 1500 });
    } else {
      timeoutId = window.setTimeout(loadGif, 250);
    }

    return () => {
      cancelled = true;
      if (idleId !== null) win.cancelIdleCallback?.(idleId);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [isGifReady, reducedMotion, isInView, isTabVisible]);

  const shouldAnimate = isGifReady && !reducedMotion;
  const isPlaying = shouldAnimate && isInView && isTabVisible;

  useEffect(() => {
    const shelf = shelfRef.current;
    if (!shelf) return;

    const tickets = [...shelf.querySelectorAll<HTMLElement>('.shelf-ticket')];
    if (!isPlaying) {
      tickets.forEach((ticket) => ticket.style.removeProperty('--swing'));
      return;
    }

    const img = shelf.querySelector<HTMLElement>('.roo-gif');
    const motion = tickets.map(() => ({ angle: 0, velocity: 0 }));
    let frame = 0;
    let last = performance.now();
    let stopped = false;

    const tick = (now: number) => {
      if (stopped) return;
      const dt = Math.min(0.034, Math.max(0, (now - last) / 1000));
      last = now;
      const body = img?.getBoundingClientRect();
      const hitBox = body
        ? {
            left: body.left + body.width * 0.1,
            right: body.right - body.width * 0.06,
            top: body.top + body.height * 0.16,
            bottom: body.bottom - body.height * 0.18
          }
        : null;

      tickets.forEach((ticket, index) => {
        const rect = ticket.getBoundingClientRect();
        const hit = Boolean(
          hitBox &&
            hitBox.left < rect.right &&
            hitBox.right > rect.left &&
            hitBox.top < rect.bottom &&
            hitBox.bottom > rect.top
        );
        const item = motion[index];
        if (hit) {
          const target = Math.sin(now / 190) * 2.6;
          item.velocity += (target - item.angle) * 140 * dt;
          item.velocity *= Math.exp(-6 * dt);
        } else {
          item.velocity += -item.angle * 36 * dt;
          item.velocity *= Math.exp(-2.4 * dt);
        }
        item.angle += item.velocity * dt;
        if (!hit && Math.abs(item.angle) < 0.04 && Math.abs(item.velocity) < 0.04) {
          item.angle = 0;
          item.velocity = 0;
        }
        ticket.style.setProperty('--swing', item.angle.toFixed(3));
      });
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      tickets.forEach((ticket) => ticket.style.removeProperty('--swing'));
    };
  }, [isPlaying]);

  function finishHop(event: AnimationEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (!event.animationName.startsWith('roo-route-')) return;
    setPass((value) => value + 1);
  }

  const routeClass = shouldAnimate
    ? pass === 0
      ? 'is-route-start'
      : `is-route-${(pass - 1) % ROUTES}`
    : 'is-static';
  const lookClass = shouldAnimate ? `roo-look-${pass % 3}` : '';
  const travelClass = ['roo-travel', lookClass, routeClass].filter(Boolean).join(' ');

  useEffect(() => {
    shelfRef.current?.closest('.kangaroo-scene')?.classList.toggle('is-paused', !isPlaying);
  }, [isPlaying]);

  return (
    <div className={travelClass} onAnimationEnd={finishHop} ref={travelRef}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static WebP upgraded to animated GIF after idle */}
      <img
        className="roo roo-gif"
        src={shouldAnimate ? GIF_SRC : STILL_SRC}
        width={160}
        height={160}
        decoding="async"
        alt=""
      />
    </div>
  );
}
