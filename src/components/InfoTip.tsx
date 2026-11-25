'use client';

import { Info } from 'lucide-react';
import { useId, useRef, useState } from 'react';

export default function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  // A tap or click fires focus/mouseenter (which open the tip) just before
  // click. Without this, that click would toggle the tip straight back shut.
  const openedAt = useRef(0);
  const show = () => {
    if (!open) openedAt.current = Date.now();
    setOpen(true);
  };
  return (
    <span className="info-tip" onMouseEnter={show} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="info-tip-button"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => {
          if (open && Date.now() - openedAt.current < 400) return;
          if (!open) openedAt.current = Date.now();
          setOpen((v) => !v);
        }}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        <Info size={14} aria-hidden="true" />
      </button>
      <span id={id} role="tooltip" className="info-tip-bubble" hidden={!open}>
        {children}
      </span>
    </span>
  );
}
