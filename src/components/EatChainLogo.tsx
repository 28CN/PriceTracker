'use client';

import { useEffect, useRef, useState } from 'react';

type EatChainLogoSize = 'card' | 'chip' | 'store';

const SIZE_PX: Record<EatChainLogoSize, number> = {
  card: 40,
  chip: 20,
  store: 18
};

export default function EatChainLogo({
  src,
  mark,
  size,
  title
}: {
  src?: string;
  mark: string;
  size: EatChainLogoSize;
  title?: string;
}) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);

  if (!src || failed) {
    return (
      <span className={`eat-chain-fallback is-${size}`} aria-hidden="true" title={title}>
        {mark}
      </span>
    );
  }

  const px = SIZE_PX[size];

  return (
    <span className={`eat-chain-logo is-${size}`} aria-hidden="true" title={title}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Self-hosted 64x64 chain logo */}
      <img
        ref={imgRef}
        src={src}
        alt=""
        width={px}
        height={px}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
