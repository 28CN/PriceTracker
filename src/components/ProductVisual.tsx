import type { ThumbSource } from '@/lib/productImage';

import ProductThumb, { ProductPlaceholder } from './ProductThumb';

export default function ProductVisual({
  source
}: {
  source: ThumbSource | null;
  name?: string;
  category?: string | null;
}) {
  return source ? <ProductThumb source={source} /> : <ProductPlaceholder />;
}
