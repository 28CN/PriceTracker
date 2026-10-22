export type StockStatus = 'unknown' | 'in_stock' | 'unavailable';

export type LinkView = {
  id: string;
  retailer: string;
  url: string;
  isActive: boolean;
  stockStatus: StockStatus;
  latestPrice: number | null;
  /** True when the saved price is older than a week and must not be shown as current. */
  priceStale: boolean;
  latestAt: string | null;
  imageUrl: string | null;
  imageCandidates: string[];
  createdAt: string | null;
};

export type ProductView = {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  targetPrice: number | null;
  /** Photo chosen in Edit; null means pick automatically from the links. */
  imageUrl: string | null;
  links: LinkView[];
  lowestPrice: number | null;
  lowestRetailer: string | null;
};

export type CategoryView = {
  id: string;
  name: string;
  isPublic: boolean;
};

export type CrawlEventView = {
  id: string;
  linkId: string | null;
  level: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  /** A link problem that has since been fixed (edited, disabled, or crawled fine). */
  resolved?: boolean;
};
