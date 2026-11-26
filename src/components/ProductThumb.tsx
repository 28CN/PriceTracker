'use client';

import { Package } from 'lucide-react';
import { useState } from 'react';

import RetailerLogo from '@/components/RetailerLogo';
import { browserCanLoadImage, type ThumbSource } from '@/lib/productImage';
import { retailerKey } from '@/lib/retailer';

type Resolved = { src: string } | 'gone';

// Survives remounts for the whole page session, so a card that already showed
// its photo never goes back to the hidden loading state.
const resolved = new Map<string, Resolved>();

export default function ProductThumb({
  source,
  shop,
  shopUrl
}: {
  source: ThumbSource;
  shop?: string | null;
  shopUrl?: string | null;
}) {
  const known = resolved.get(source.proxied);
  const [src, setSrc] = useState(known && known !== 'gone' ? known.src : source.proxied);
  const [status, setStatus] = useState<'pending' | 'ready' | 'gone'>(
    known === 'gone' ? 'gone' : known ? 'ready' : 'pending'
  );

  if (!browserCanLoadImage(source.raw) || status === 'gone') {
    return <ProductPlaceholder shop={shop} shopUrl={shopUrl} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary retailer image hosts; next/image would need a remote allowlist
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

/** Same box as a loaded thumbnail, for products with no (or a broken) photo. */
export function ProductPlaceholder({
  shop,
  shopUrl
}: {
  shop?: string | null;
  shopUrl?: string | null;
} = {}) {
  const trimmedShop = shop?.trim() || '';
  const hasShop = Boolean(trimmedShop);
  const slug = hasShop ? retailerKey(shopUrl || trimmedShop) : null;
  return (
    <span
      className={`product-thumb product-thumb-placeholder is-ready${hasShop ? ' has-shop-logo' : ''}`}
      data-shop={slug ?? undefined}
      aria-hidden="true"
    >
      {hasShop ? (
        <RetailerLogo retailer={trimmedShop} url={shopUrl} />
      ) : (
        <Package size={26} strokeWidth={1.6} />
      )}
    </span>
  );
}
