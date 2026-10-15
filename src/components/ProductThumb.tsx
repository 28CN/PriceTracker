'use client';

import { useState } from 'react';

import type { ThumbSource } from '@/lib/productImage';

type Resolved = { src: string } | 'gone';

// Survives remounts for the whole page session, so a card that already showed
// its photo never goes back to the hidden loading state.
const resolved = new Map<string, Resolved>();

export default function ProductThumb({ source }: { source: ThumbSource }) {
  const known = resolved.get(source.proxied);
  const [src, setSrc] = useState(known && known !== 'gone' ? known.src : source.proxied);
  const [status, setStatus] = useState<'pending' | 'ready' | 'gone'>(
    known === 'gone' ? 'gone' : known ? 'ready' : 'pending'
  );

  if (status === 'gone') {
    return null;
  }

  return (
    <img
      className={`product-thumb${status === 'ready' ? ' is-ready' : ' is-loading'}`}
      src={src}
      alt=""
      width={76}
      height={76}
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={() => {
        resolved.set(source.proxied, { src });
        setStatus('ready');
      }}
      onError={() => {
        if (src !== source.raw) {
          setSrc(source.raw);
          setStatus('pending');
          return;
        }
        resolved.set(source.proxied, 'gone');
        setStatus('gone');
      }}
    />
  );
}
