import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';

// Plain form post: /demo/exit (PR #23) signs out, clears cookies and 303s to '/'.
export const DEMO_EXIT_ACTION = '/demo/exit';

export default function ExitDemoButton({
  className = 'button demo-exit',
  label = 'Leave sample',
  children
}: {
  className?: string;
  label?: string;
  children?: ReactNode;
}) {
  return (
    <form method="post" action={DEMO_EXIT_ACTION} className="demo-form">
      <button type="submit" className={className} aria-label={children ? label : undefined}>
        {children ?? (
          <>
            <LogOut size={15} aria-hidden="true" />
            {label}
          </>
        )}
      </button>
    </form>
  );
}
