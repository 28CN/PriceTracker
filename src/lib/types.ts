export type LinkView = {
  id: string;
  retailer: string;
  url: string;
  isActive: boolean;
  latestPrice: number | null;
  latestAt: string | null;
};

export type ProductView = {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  targetPrice: number | null;
  listKind: 'daily' | 'daigou';
  imageUrl: string | null;
  links: LinkView[];
  lowestPrice: number | null;
  lowestRetailer: string | null;
};

export type CategoryView = {
  id: string;
  name: string;
};

export type CrawlEventView = {
  id: string;
  level: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};
