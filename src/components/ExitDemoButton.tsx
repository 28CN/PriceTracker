'use client';

import { LogOut } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { exitDemo } from '@/lib/exitDemo';

export default function ExitDemoButton({
  className = 'button demo-exit',
  label = 'Exit demo',
  children
}: {
  className?: string;
  label?: string;
  children?: ReactNode;
}) {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      className={className}
      aria-label={children ? label : undefined}
      disabled={pending}
      onClick={() => {
        setPending(true);
        void exitDemo();
      }}
    >
      {children ?? (
        <>
          <LogOut size={15} aria-hidden="true" />
          {pending ? 'Leaving…' : label}
        </>
      )}
    </button>
  );
}
