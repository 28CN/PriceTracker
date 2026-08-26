'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  LAST_LIST_STORAGE_KEY,
  LIST_BLURBS,
  LIST_KINDS,
  LIST_LABELS,
  parseListKind,
  type ListKind
} from '@/lib/listKind';

export default function BetaHomePage() {
  const [lastList, setLastList] = useState<ListKind | null>(null);

  useEffect(() => {
    setLastList(parseListKind(window.localStorage.getItem(LAST_LIST_STORAGE_KEY)));
  }, []);

  function remember(list: ListKind) {
    window.localStorage.setItem(LAST_LIST_STORAGE_KEY, list);
  }

  return (
    <main>
      <h1 className="beta-title">Which list?</h1>
      <p className="hint" style={{ marginTop: 6 }}>
        Two separate trackers on the same site. Live PriceTracker at home is untouched.
      </p>

      {lastList ? (
        <p className="hint" style={{ marginTop: 12 }}>
          Last time:{' '}
          <Link href={`/beta/${lastList}`} onClick={() => remember(lastList)}>
            continue to {LIST_LABELS[lastList]}
          </Link>
        </p>
      ) : null}

      <div className="beta-chooser">
        {LIST_KINDS.map((list) => (
          <Link
            key={list}
            className="beta-choice"
            href={`/beta/${list}`}
            onClick={() => remember(list)}
          >
            <strong>{LIST_LABELS[list]}</strong>
            <span>{LIST_BLURBS[list]}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
