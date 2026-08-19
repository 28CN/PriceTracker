import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const TABLES = ['products', 'tracked_links', 'price_history', 'categories'] as const;

// Reports row visibility per key so an empty home page can be told apart from a
// query error or an RLS policy gap. Counts and messages only, never a key value.
async function countsFor(url: string, key: string) {
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const result: Record<string, unknown> = {};

  for (const table of TABLES) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    result[table] = error ? { error: error.message } : { count };
  }

  return result;
}

export async function GET() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  const report: Record<string, unknown> = {
    env: {
      NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(anonKey),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(serviceKey)
    }
  };

  if (!url) {
    return NextResponse.json({ ...report, fatal: 'No Supabase URL configured.' }, { status: 500 });
  }

  try {
    report.withAnonKey = anonKey ? await countsFor(url, anonKey) : 'anon key missing';
    report.withServiceKey = serviceKey ? await countsFor(url, serviceKey) : 'service key missing';
  } catch (error) {
    report.fatal = error instanceof Error ? error.message : 'Unknown error.';
  }

  // Every product, not a sample: the point of this route is to answer "why is
  // the home page missing a product", which a truncated list cannot do.
  try {
    const { fetchProducts, fetchCategories } = await import('@/lib/queries');
    const [products, categories] = await Promise.all([fetchProducts(), fetchCategories()]);

    report.categories = categories.map((category) => category.name);
    report.fetchProducts = {
      productCount: products.length,
      products: products.map((product) => ({
        name: product.name,
        category: product.categoryName,
        categoryId: product.categoryId,
        links: product.links.map((l) => ({
          id: l.id,
          retailer: l.retailer,
          latestPrice: l.latestPrice,
          latestAt: l.latestAt,
          isActive: l.isActive
        })),
        lowestPrice: product.lowestPrice,
        lowestRetailer: product.lowestRetailer
      }))
    };
  } catch (error) {
    report.fetchProducts = { error: error instanceof Error ? error.message : 'Unknown error.' };
  }

  report.generatedAt = new Date().toISOString();

  return NextResponse.json(report);
}
