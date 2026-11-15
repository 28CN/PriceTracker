import type { Metadata } from 'next';

import InfoTip from '@/components/InfoTip';
import ProductList from '@/components/ProductList';
import type { LinkView, ProductView } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Card examples',
  robots: { index: false, follow: false }
};

function link(partial: {
  id: string;
  retailer: string;
  url: string;
  price?: number | null;
  at?: string | null;
  stale?: boolean;
  stock?: LinkView['stockStatus'];
}): LinkView {
  return {
    id: partial.id,
    retailer: partial.retailer,
    url: partial.url,
    isActive: true,
    stockStatus: partial.stock ?? 'in_stock',
    latestPrice: partial.price ?? null,
    priceStale: partial.stale ?? false,
    latestAt: partial.at ?? null,
    imageUrl: null,
    imageCandidates: [],
    createdAt: '2026-10-01T00:00:00.000Z'
  };
}

const checked = '2026-11-04T01:00:00.000Z';

const examples: ProductView[] = [
  {
    id: 'ex-fresh',
    name: 'Kitchen cleaner, 500 ml',
    categoryId: null,
    categoryName: 'House',
    targetPrice: 30,
    imageUrl: null,
    lowestPrice: 22.99,
    lowestRetailer: 'Auto Barn',
    links: [
      link({ id: 'a', retailer: 'Auto Barn', url: 'https://autobarn.com.au/cleaner', price: 22.99, at: checked }),
      link({ id: 'b', retailer: 'Woolworths', url: 'https://woolworths.com.au/cleaner', price: 31.5, at: checked })
    ]
  },
  {
    id: 'ex-long',
    name: 'Very long product name that has to wrap onto more than one line without pushing the price off the card',
    categoryId: null,
    categoryName: 'House',
    targetPrice: 10000,
    imageUrl: null,
    lowestPrice: 12345.67,
    lowestRetailer: 'Terry White',
    links: [
      link({
        id: 'c',
        retailer: 'Terry White',
        url: 'https://terrywhitechemmart.com.au/item',
        price: 12345.67,
        at: checked
      })
    ]
  },
  {
    id: 'ex-queued',
    name: 'Classic brick box',
    categoryId: null,
    categoryName: 'Toys',
    targetPrice: null,
    imageUrl: null,
    lowestPrice: null,
    lowestRetailer: null,
    checkState: 'queued',
    links: [
      link({ id: 'd', retailer: 'Big W', url: 'https://bigw.com.au/bricks' }),
      link({ id: 'e', retailer: 'Kmart', url: 'https://kmart.com.au/bricks' })
    ]
  },
  {
    id: 'ex-checking',
    name: 'Dog food, 3 kg',
    categoryId: null,
    categoryName: 'Pets',
    targetPrice: null,
    imageUrl: null,
    lowestPrice: null,
    lowestRetailer: null,
    checkState: 'checking',
    links: [link({ id: 'f', retailer: 'Coles', url: 'https://coles.com.au/dog-food' })]
  },
  {
    id: 'ex-none',
    name: 'Creative food set',
    categoryId: null,
    categoryName: 'Toys',
    targetPrice: null,
    imageUrl: null,
    lowestPrice: null,
    lowestRetailer: null,
    links: [
      link({ id: 'g', retailer: 'Target', url: 'https://target.com.au/food-set' }),
      link({ id: 'h', retailer: 'Kmart', url: 'https://kmart.com.au/food-set' })
    ]
  },
  {
    id: 'ex-stale',
    name: 'Paint tray',
    categoryId: null,
    categoryName: 'House',
    targetPrice: 15,
    imageUrl: null,
    lowestPrice: null,
    lowestRetailer: null,
    links: [
      link({
        id: 'i',
        retailer: 'Bunnings',
        url: 'https://bunnings.com.au/tray',
        price: 18.5,
        at: '2026-09-01T01:00:00.000Z',
        stale: true
      })
    ]
  },
  {
    id: 'ex-out',
    name: 'Winter coat',
    categoryId: null,
    categoryName: 'Clothes',
    targetPrice: null,
    imageUrl: null,
    lowestPrice: null,
    lowestRetailer: null,
    links: [
      link({
        id: 'j',
        retailer: 'Myer',
        url: 'https://myer.com.au/coat',
        stock: 'unavailable',
        at: checked
      })
    ]
  },
  {
    id: 'ex-unsupported',
    name: 'Corner hardware special',
    categoryId: null,
    categoryName: 'House',
    targetPrice: null,
    imageUrl: null,
    lowestPrice: null,
    lowestRetailer: null,
    links: [
      link({
        id: 'k',
        retailer: 'Corner Hardware',
        url: 'https://corner-hardware.example/special'
      })
    ]
  }
];

export default function CardExamplesPage() {
  return (
    <main>
      <h1>Examples</h1>
      <p className="hint">
        Sample cards, not your list.
        <InfoTip label="About these examples">Made-up products so the layout can be checked. Nothing here is a live price.</InfoTip>
      </p>
      <ProductList products={examples} />
      <h2>Narrow columns</h2>
      <div className="squeeze-row">
        <div className="squeeze-280">
          <ProductList products={examples.slice(0, 2)} readOnly />
        </div>
        <div className="squeeze-360">
          <ProductList products={examples.slice(2, 4)} readOnly />
        </div>
        <div className="squeeze-520">
          <ProductList products={examples.slice(4, 6)} readOnly />
        </div>
      </div>
    </main>
  );
}
