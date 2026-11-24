import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import DashboardWorkspace from '@/components/DashboardWorkspace';
import type { CategoryLayout } from '@/lib/categoryLayout';
import type { OverviewResponse } from '@/lib/overview';
import { sortProducts, type CategoryGroup } from '@/lib/productSort';
import type { LinkView, ProductView } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Dashboard preview',
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
    createdAt: '2026-09-01T00:00:00.000Z'
  };
}

const REFERENCE_NOW = Date.parse('2026-11-24T00:00:00.000Z');
const FRESH_AT = '2026-11-22T02:00:00.000Z';
const STALE_NEW_AT = '2026-10-28T02:00:00.000Z';
const STALE_OLD_AT = '2026-10-21T02:00:00.000Z';

const sampleProducts: ProductView[] = [
  {
    id: 'pv-hw-5pack',
    name: 'Hot Wheels 5-Pack Cars',
    categoryId: 'cat-toys',
    categoryName: 'Toys',
    targetPrice: 10,
    imageUrl: null,
    lowestPrice: 8,
    lowestRetailer: 'Kmart',
    links: [
      link({
        id: 'lnk-hw-kmart',
        retailer: 'Kmart',
        url: 'https://www.kmart.com.au/product/hot-wheels-5-pack',
        price: 8,
        at: FRESH_AT
      }),
      link({
        id: 'lnk-hw-bigw',
        retailer: 'BIG W',
        url: 'https://www.bigw.com.au/product/hot-wheels-5-pack',
        price: 10,
        at: FRESH_AT
      }),
      link({
        id: 'lnk-hw-target',
        retailer: 'Target',
        url: 'https://www.target.com.au/p/hot-wheels-5-pack',
        price: 11,
        at: FRESH_AT
      })
    ]
  },
  {
    id: 'pv-matchbox',
    name: 'Matchbox Basic Car',
    categoryId: 'cat-toys',
    categoryName: 'Toys',
    targetPrice: 3.5,
    imageUrl: null,
    lowestPrice: 4,
    lowestRetailer: 'Woolworths',
    links: [
      link({
        id: 'lnk-mb-woolies',
        retailer: 'Woolworths',
        url: 'https://www.woolworths.com.au/shop/productdetails/matchbox-basic-car',
        price: 4,
        at: FRESH_AT
      }),
      link({
        id: 'lnk-mb-coles',
        retailer: 'Coles',
        url: 'https://www.coles.com.au/product/matchbox-basic-car',
        price: 4,
        at: FRESH_AT
      })
    ]
  },
  {
    id: 'pv-lego-box',
    name: 'LEGO Classic Medium Creative Brick Box',
    categoryId: 'cat-toys',
    categoryName: 'Toys',
    targetPrice: 35,
    imageUrl: null,
    lowestPrice: 29,
    lowestRetailer: 'BIG W',
    links: [
      link({
        id: 'lnk-lego-bigw',
        retailer: 'BIG W',
        url: 'https://www.bigw.com.au/product/lego-classic-10696',
        price: 29,
        at: FRESH_AT
      }),
      link({
        id: 'lnk-lego-amazon',
        retailer: 'Amazon AU',
        url: 'https://www.amazon.com.au/dp/B00NVDP3ZU',
        price: 34,
        at: FRESH_AT
      }),
      link({
        id: 'lnk-lego-kmart',
        retailer: 'Kmart',
        url: 'https://www.kmart.com.au/product/lego-classic-10696',
        price: 39,
        at: FRESH_AT
      })
    ]
  },
  {
    id: 'pv-coffee',
    name: 'Moccona Classic Medium Roast Coffee, 400 g',
    categoryId: 'cat-pantry',
    categoryName: 'Pantry',
    targetPrice: 22,
    imageUrl: null,
    lowestPrice: 24,
    lowestRetailer: 'Coles',
    links: [
      link({
        id: 'lnk-coffee-coles',
        retailer: 'Coles',
        url: 'https://www.coles.com.au/product/moccona-classic-400g',
        price: 24,
        at: FRESH_AT
      }),
      link({
        id: 'lnk-coffee-woolies',
        retailer: 'Woolworths',
        url: 'https://www.woolworths.com.au/shop/productdetails/moccona-classic-400g',
        price: 28,
        at: FRESH_AT
      })
    ]
  },
  {
    id: 'pv-dish-tabs',
    name: 'Finish Quantum Ultimate Dishwashing Tablets, 60 Pack',
    categoryId: 'cat-house',
    categoryName: 'Household',
    targetPrice: 25,
    imageUrl: null,
    lowestPrice: 22,
    lowestRetailer: 'Woolworths',
    links: [
      link({
        id: 'lnk-tabs-woolies',
        retailer: 'Woolworths',
        url: 'https://www.woolworths.com.au/shop/productdetails/finish-quantum-60',
        price: 22,
        at: FRESH_AT
      }),
      link({
        id: 'lnk-tabs-coles',
        retailer: 'Coles',
        url: 'https://www.coles.com.au/product/finish-quantum-60',
        price: 32,
        at: STALE_OLD_AT,
        stale: true
      })
    ]
  },
  {
    id: 'pv-batteries',
    name: 'Energizer Max AA Batteries, 16 Pack',
    categoryId: 'cat-house',
    categoryName: 'Household',
    targetPrice: 18,
    imageUrl: null,
    lowestPrice: null,
    lowestRetailer: null,
    links: [
      link({
        id: 'lnk-bat-target',
        retailer: 'Target',
        url: 'https://www.target.com.au/p/energizer-max-aa-16',
        price: 19.5,
        at: STALE_NEW_AT,
        stale: true
      }),
      link({
        id: 'lnk-bat-woolies',
        retailer: 'Woolworths',
        url: 'https://www.woolworths.com.au/shop/productdetails/energizer-max-aa-16',
        price: 21,
        at: STALE_OLD_AT,
        stale: true
      })
    ]
  },
  {
    id: 'pv-controller',
    name: 'Sony DualSense Wireless Controller',
    categoryId: 'cat-elec',
    categoryName: 'Electronics',
    targetPrice: 85,
    imageUrl: null,
    lowestPrice: null,
    lowestRetailer: null,
    links: [
      link({
        id: 'lnk-ctrl-amazon',
        retailer: 'Amazon AU',
        url: 'https://www.amazon.com.au/dp/B08H99BPJN',
        stock: 'unavailable',
        at: FRESH_AT
      }),
      link({
        id: 'lnk-ctrl-bigw',
        retailer: 'BIG W',
        url: 'https://www.bigw.com.au/product/sony-dualsense',
        stock: 'unavailable',
        at: FRESH_AT
      })
    ]
  },
  {
    id: 'pv-toaster',
    name: 'Anko 4-Slice Toaster',
    categoryId: 'cat-house',
    categoryName: 'Household',
    targetPrice: 25,
    imageUrl: null,
    lowestPrice: 29,
    lowestRetailer: 'Kmart',
    links: [
      link({
        id: 'lnk-toast-kmart',
        retailer: 'Kmart',
        url: 'https://www.kmart.com.au/product/anko-4-slice-toaster',
        price: 29,
        at: FRESH_AT
      })
    ]
  }
];

const sampleOverview: OverviewResponse = {
  trackedCount: sampleProducts.length,
  belowGoalCount: 3,
  droppedThisWeekCount: 3,
  sparklines: {
    tracked: [100, 99.4, 98.8, 100.2, 97.6, 98.1, 96.2, 94.5],
    belowGoal: [1, 1, 2, 1, 2, 1, 1, 3],
    dropped: [1, 2, 1, 0, 2, 1, 2, 3]
  },
  biggestDrops: [
    {
      productId: 'pv-hw-5pack',
      linkId: 'lnk-hw-kmart',
      name: 'Hot Wheels 5-Pack Cars',
      retailer: 'Kmart',
      oldPrice: 11,
      newPrice: 8
    },
    {
      productId: 'pv-lego-box',
      linkId: 'lnk-lego-bigw',
      name: 'LEGO Classic Medium Creative Brick Box',
      retailer: 'BIG W',
      oldPrice: 39,
      newPrice: 29
    },
    {
      productId: 'pv-coffee',
      linkId: 'lnk-coffee-coles',
      name: 'Moccona Classic Medium Roast Coffee, 400 g',
      retailer: 'Coles',
      oldPrice: 28,
      newPrice: 24
    }
  ],
  newlyBelowGoal: [
    {
      productId: 'pv-hw-5pack',
      linkId: 'lnk-hw-kmart',
      name: 'Hot Wheels 5-Pack Cars',
      retailer: 'Kmart',
      oldPrice: 11,
      newPrice: 8
    },
    {
      productId: 'pv-lego-box',
      linkId: 'lnk-lego-bigw',
      name: 'LEGO Classic Medium Creative Brick Box',
      retailer: 'BIG W',
      oldPrice: 39,
      newPrice: 29
    }
  ],
  usualPriceRises: [
    {
      productId: 'pv-matchbox',
      linkId: 'lnk-mb-woolies',
      name: 'Matchbox Basic Car',
      retailer: 'Woolworths',
      oldPrice: 3.5,
      newPrice: 4,
      at: '2026-11-03T02:00:00.000Z'
    }
  ]
};

const sampleLayout: CategoryLayout = {
  pinned: ['Toys'],
  otherOrder: ['Household', 'Pantry', 'Electronics']
};

function buildGroups(products: ProductView[]): CategoryGroup[] {
  const grouped = new Map<string, ProductView[]>();
  for (const product of products) {
    const key = product.categoryName || 'Uncategorised';
    const bucket = grouped.get(key);
    if (bucket) bucket.push(product);
    else grouped.set(key, [product]);
  }
  return [...grouped.entries()].map(([category, items]) => ({
    category,
    products: sortProducts(items)
  }));
}

export default async function DashboardPreviewPage({
  searchParams
}: {
  searchParams: Promise<{ overview?: string }>;
}) {
  // Sample data for reviewing the layout locally and on preview deployments only.
  if (process.env.VERCEL_ENV === 'production') notFound();
  // ?overview=fetch loads the This week data after paint, like the signed-in page.
  const { overview } = await searchParams;
  const groups = buildGroups(sampleProducts);
  return (
    <DashboardWorkspace
      products={sampleProducts}
      groups={groups}
      savedLayout={sampleLayout}
      isDemo
      accountHref={null}
      loadError={null}
      initialOverview={overview === 'fetch' ? null : sampleOverview}
      referenceNow={REFERENCE_NOW}
    />
  );
}
