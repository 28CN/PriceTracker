'use client';

import { useEffect, useRef, useState, type AnimationEvent } from 'react';

const ROUTES = 4;

export default function KangarooPriceAnimation() {
  const shelfRef = useRef<HTMLDivElement>(null);
  const [pass, setPass] = useState(0);

  useEffect(() => {
    const shelf = shelfRef.current;
    if (!shelf || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const tickets = [...shelf.querySelectorAll<HTMLElement>('.shelf-ticket')];
    const motion = tickets.map(() => ({ angle: 0, velocity: 0 }));
    let frame = 0;
    let last = performance.now();
    let stopped = false;

    const tick = (now: number) => {
      if (stopped) return;
      const dt = Math.min(0.034, (now - last) / 1000);
      last = now;
      const img = shelf.querySelector<HTMLElement>('.roo-gif');
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
  }, []);

  function finishHop(event: AnimationEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (!event.animationName.startsWith('roo-route-')) return;
    setPass((value) => value + 1);
  }

  return (
    <div className="kangaroo-scene">
      <div className="shelf" aria-hidden="true" ref={shelfRef}>
        <svg className="aisle" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice">
          <rect className="aisle-cooler" x="14" y="18" width="84" height="292" rx="8" />
          <path className="aisle-cooler-shine" d="M28 36h8v256h-8z" />
          <rect className="aisle-handle" x="82" y="150" width="6" height="36" rx="3" />
          <rect className="aisle-shelf-board" x="14" y="108" width="612" height="11" rx="2" />
          <rect className="aisle-shelf-board" x="14" y="214" width="612" height="11" rx="2" />
          <rect className="aisle-shelf-board" x="14" y="322" width="612" height="12" rx="2" />

          <g className="aisle-can">
            <rect x="248" y="62" width="22" height="42" rx="9" />
            <ellipse className="aisle-label" cx="259" cy="64" rx="11" ry="4" />
            <rect x="278" y="70" width="22" height="34" rx="9" />
            <ellipse className="aisle-label" cx="289" cy="72" rx="11" ry="4" />
            <rect x="308" y="58" width="22" height="46" rx="9" />
            <ellipse className="aisle-label" cx="319" cy="60" rx="11" ry="4" />
          </g>
          <g className="aisle-warm">
            <rect x="340" y="66" width="22" height="38" rx="9" />
            <ellipse className="aisle-label" cx="351" cy="68" rx="11" ry="4" />
            <rect x="370" y="74" width="22" height="30" rx="9" />
            <ellipse className="aisle-label" cx="381" cy="76" rx="11" ry="4" />
          </g>
          <g className="aisle-box">
            <rect x="188" y="64" width="50" height="40" rx="4" />
            <rect className="aisle-label" x="194" y="76" width="38" height="12" rx="2" />
            <rect x="404" y="72" width="58" height="32" rx="4" />
            <rect className="aisle-label" x="412" y="82" width="42" height="10" rx="2" />
          </g>

          <g className="aisle-can">
            <rect x="118" y="164" width="24" height="46" rx="10" />
            <ellipse className="aisle-label" cx="130" cy="166" rx="12" ry="4.5" />
            <rect x="148" y="174" width="24" height="36" rx="10" />
            <ellipse className="aisle-label" cx="160" cy="176" rx="12" ry="4.5" />
            <rect x="520" y="160" width="24" height="50" rx="10" />
            <ellipse className="aisle-label" cx="532" cy="162" rx="12" ry="4.5" />
            <rect x="550" y="172" width="24" height="38" rx="10" />
            <ellipse className="aisle-label" cx="562" cy="174" rx="12" ry="4.5" />
            <rect x="580" y="166" width="24" height="44" rx="10" />
            <ellipse className="aisle-label" cx="592" cy="168" rx="12" ry="4.5" />
          </g>
          <g className="aisle-box">
            <rect x="186" y="162" width="64" height="48" rx="4" />
            <rect className="aisle-label" x="194" y="176" width="48" height="14" rx="2" />
            <rect x="430" y="168" width="72" height="42" rx="4" />
            <rect className="aisle-label" x="440" y="180" width="52" height="12" rx="2" />
          </g>

          <g className="aisle-box">
            <rect x="112" y="268" width="78" height="50" rx="4" />
            <rect className="aisle-label" x="122" y="284" width="58" height="14" rx="2" />
            <rect x="198" y="280" width="56" height="38" rx="4" />
            <rect className="aisle-label" x="206" y="292" width="40" height="12" rx="2" />
            <rect x="470" y="266" width="70" height="52" rx="4" />
            <rect className="aisle-label" x="480" y="282" width="50" height="14" rx="2" />
            <rect x="548" y="278" width="62" height="40" rx="4" />
            <rect className="aisle-label" x="556" y="290" width="46" height="12" rx="2" />
          </g>
        </svg>

        <article className="shelf-ticket ticket-regular">
          <header>Shelf price</header>
          <strong>$42.00</strong>
          <small>each</small>
          <i />
        </article>
        <article className="shelf-ticket ticket-special">
          <header>Special</header>
          <del>Was $42.00</del>
          <strong>$29.40</strong>
          <em>30% off</em>
          <i />
        </article>
        <article className="shelf-ticket ticket-half">
          <header>Half price</header>
          <del>Was $42.00</del>
          <strong>$21.00</strong>
          <em>1/2 off</em>
          <i />
        </article>

        <div
          className={`roo-travel roo-look-${pass % 3} is-route-${pass % ROUTES}`}
          onAnimationEnd={finishHop}
        >
          <img className="roo roo-gif" src="/illustrations/kangaroo.gif" alt="" />
          <svg className="roo roo-drawn" viewBox="0 0 150 160">
            <g className="roo-tail">
              <path d="M62 108C24 104 6 74 16 52c12 18 28 34 48 44" />
            </g>
            <g className="roo-leg">
              <path d="M72 124c-10 18-4 28 12 28h16" />
              <path d="M98 126c8 16 22 20 32 12" />
            </g>
            <ellipse className="roo-body" cx="86" cy="102" rx="34" ry="40" />
            <ellipse className="roo-belly" cx="98" cy="112" rx="20" ry="24" />
            <path className="roo-pouch" d="M84 118c2 16 28 16 30-2-8 6-22 6-30 2z" />
            <g className="roo-joey">
              <path d="M96 104c-8-16-2-24 4-20 2 6 2 12 0 18" />
              <path d="M112 102c8-16 14-12 10 0-4 4-8 8-10 12" />
              <ellipse cx="104" cy="112" rx="10" ry="9" />
              <circle cx="108" cy="111" r="1.3" />
              <path d="M110 115c2 2 4 2 6 0" />
            </g>
            <g className="roo-arm">
              <path d="M108 90c14 2 20 12 12 20" />
              <path d="M104 96c12 6 14 14 6 18" />
            </g>
            <g className="roo-head">
              <g className="roo-ear roo-ear-back">
                <path d="M92 42c-6-28 14-34 16-8" />
              </g>
              <g className="roo-ear roo-ear-front">
                <path d="M108 36c0-30 20-32 16-4" />
              </g>
              <ellipse cx="108" cy="52" rx="20" ry="17" />
              <ellipse className="roo-muzzle" cx="122" cy="58" rx="8" ry="6" />
              <circle className="roo-eye" cx="114" cy="50" r="1.7" />
              <path d="M124 56c3 2 5 1 7-1" />
            </g>
          </svg>
        </div>
      </div>
      <span>Checking prices across Australian retailers</span>
    </div>
  );
}
