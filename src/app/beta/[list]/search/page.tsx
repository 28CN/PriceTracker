import { notFound } from 'next/navigation';

import SearchPanel from '@/components/beta/SearchPanel';
import { parseListKind } from '@/lib/listKind';
import { fetchCategories, fetchProducts } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function BetaSearchPage({
  params,
  searchParams
}: {
  params: { list: string };
  searchParams: { q?: string };
}) {
  const list = parseListKind(params.list);
  if (!list) {
    notFound();
  }

  const [products, categories] = await Promise.all([
    fetchProducts(list).catch(() => []),
    fetchCategories().catch(() => [])
  ]);

  return (
    <main>
      <SearchPanel
        listKind={list}
        products={products}
        categories={categories}
        initialQuery={typeof searchParams.q === 'string' ? searchParams.q : ''}
      />
    </main>
  );
}
