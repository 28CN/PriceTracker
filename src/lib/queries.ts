import { toNumber } from './format';
import { getReadClient } from './supabase';
import type { CategoryView, ProductView } from './types';

type RawPrice = { price: number | string | null; created_at: string };

type RawLink = {
  id: string;
  retailer: string | null;
  url: string | null;
  is_active: boolean | null;
  price_history: RawPrice[] | null;
};

type RawProduct = {
  id: string;
  name: string;
  target_price: number | string | null;
  category_id: string | null;
  categories: { id: string; name: string } | null;
  tracked_links: RawLink[] | null;
};

export async function fetchProducts(): Promise<ProductView[]> {
  const supabase = getReadClient();

  const { data, error } = await supabase
    .from('products')
    .select(
      'id, name, target_price, category_id, categories(id, name), tracked_links(id, retailer, url, is_active, price_history(price, created_at))'
    )
    .order('name', { ascending: true })
    // Only the newest reading per link is needed, so avoid dragging the whole
    // history down the wire every time the page renders.
    .order('created_at', {
      referencedTable: 'tracked_links.price_history',
      ascending: false
    })
    .limit(1, { referencedTable: 'tracked_links.price_history' });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data || []) as unknown as RawProduct[];

  return rows.map((row) => {
    const links = (row.tracked_links || []).map((link) => {
      const latest = link.price_history?.[0] ?? null;
      return {
        id: link.id,
        retailer: link.retailer || 'Unknown shop',
        url: link.url || '',
        isActive: link.is_active !== false,
        latestPrice: latest ? toNumber(latest.price) : null,
        latestAt: latest?.created_at ?? null
      };
    });

    links.sort((a, b) => {
      if (a.latestPrice === null && b.latestPrice === null) {
        return a.retailer.localeCompare(b.retailer);
      }
      if (a.latestPrice === null) return 1;
      if (b.latestPrice === null) return -1;
      return a.latestPrice - b.latestPrice;
    });

    const cheapest = links.find((link) => link.isActive && link.latestPrice !== null) ?? null;

    return {
      id: row.id,
      name: row.name,
      categoryId: row.category_id,
      categoryName: row.categories?.name ?? null,
      targetPrice: toNumber(row.target_price),
      links,
      lowestPrice: cheapest?.latestPrice ?? null,
      lowestRetailer: cheapest?.retailer ?? null
    } satisfies ProductView;
  });
}

export async function fetchCategories(): Promise<CategoryView[]> {
  const supabase = getReadClient();

  const { data, error } = await supabase
    .from('categories')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as CategoryView[];
}
