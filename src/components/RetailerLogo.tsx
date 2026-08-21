'use client';

import { useState } from 'react';

import { retailerLogoUrl } from '@/lib/retailer';

export default function RetailerLogo({
  retailer,
  url
}: {
  retailer: string;
  url?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const src = retailerLogoUrl(url || retailer);
  const initial = (retailer || '?').trim().charAt(0).toUpperCase() || '?';

  if (!src || failed) {
    return (
      <span className="retailer-logo fallback" aria-hidden>
        {initial}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="retailer-logo"
      src={src}
      alt=""
      width={18}
      height={18}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
