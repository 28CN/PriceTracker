'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  LAST_LIST_STORAGE_KEY,
  LIST_KINDS,
  LIST_LABELS,
  type ListKind
} from '@/lib/listKind';

export default function BetaNav({ list }: { list: ListKind }) {
  const pathname = usePathname();

  function remember(next: ListKind) {
    window.localStorage.setItem(LAST_LIST_STORAGE_KEY, next);
  }

  return (
    <nav className="beta-nav" aria-label="Beta lists">
      <div className="beta-tabs">
        {LIST_KINDS.map((item) => (
          <Link
            key={item}
            href={`/beta/${item}`}
            className={`beta-tab${item === list ? ' is-active' : ''}`}
            onClick={() => remember(item)}
          >
            {LIST_LABELS[item]}
          </Link>
        ))}
      </div>
      <div className="beta-nav-actions">
        <Link
          className={`button topbar-manage${pathname?.includes('/search') ? ' primary' : ''}`}
          href={`/beta/${list}/search`}
        >
          Search
        </Link>
        <Link
          className={`button topbar-manage${pathname?.includes('/manage') ? ' primary' : ''}`}
          href={`/beta/${list}/manage`}
        >
          Manage
        </Link>
      </div>
    </nav>
  );
}
