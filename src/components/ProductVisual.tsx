import type { ThumbSource } from '@/lib/productImage';

import ProductThumb, { ProductPlaceholder } from './ProductThumb';

export default function ProductVisual({
  source,
  shop,
  shopUrl
}: {
  source: ThumbSource | null;
  name?: string;
  category?: string | null;
  shop?: string | null;
  shopUrl?: string | null;
}) {
  return source ? (
    <ProductThumb source={source} shop={shop} shopUrl={shopUrl} />
  ) : (
    <ProductPlaceholder shop={shop} shopUrl={shopUrl} />
  );
}
