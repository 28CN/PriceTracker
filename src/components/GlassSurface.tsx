'use client';

import { type PointerEvent, type ReactNode } from 'react';

export default function GlassSurface({
  as: Tag = 'section',
  className,
  children
}: {
  as?: 'section' | 'article' | 'div';
  className?: string;
  children: ReactNode;
}) {
  function moveSpot(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === 'touch') return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
  }

  return (
    <Tag className={['glass-surface', className].filter(Boolean).join(' ')} onPointerMove={moveSpot}>
      {children}
    </Tag>
  );
}
