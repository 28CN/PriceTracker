import type { ThumbSource } from '@/lib/productImage';

import ProductThumb from './ProductThumb';

const UNSPLASH_FALLBACKS = [
  'https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=360&q=80',
  'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=360&q=80',
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=360&q=80',
  'https://images.unsplash.com/photo-1607082349566-187342175e2f?auto=format&fit=crop&w=360&q=80',
  'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?auto=format&fit=crop&w=360&q=80'
] as const;

function fallbackFor(theme: string) {
  let hash = 0;
  for (let index = 0; index < theme.length; index += 1) {
    hash = (hash * 31 + theme.charCodeAt(index)) >>> 0;
  }
  return UNSPLASH_FALLBACKS[hash % UNSPLASH_FALLBACKS.length];
}

export default function ProductVisual({
  source,
  name,
  category
}: {
  source: ThumbSource | null;
  name: string;
  category: string | null;
}) {
  if (source) {
    return <ProductThumb source={source} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary retailer image hosts; next/image would need a remote allowlist
    <img
      className="product-thumb product-thumb-photo is-ready"
      src={fallbackFor(`${category || 'shopping'} ${name}`)}
      alt=""
      width={76}
      height={76}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
    />
  );
}
