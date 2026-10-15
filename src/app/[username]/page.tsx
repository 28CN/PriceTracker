import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import CategoryList from '@/components/CategoryList';
import DashboardHero from '@/components/DashboardHero';
import { getViewer, normalizeUsername } from '@/lib/auth';
import { sortProducts } from '@/lib/productSort';
import { fetchProducts } from '@/lib/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ProductView } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type PageProps = { params: Promise<{ username: string }> };

async function findProfile(username: string) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, watchlist_visibility')
    .eq('username', normalizeUsername(username))
    .maybeSingle();
  return { supabase, profile: data };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;
  const { profile } = await findProfile(username);
  if (!profile) return { title: 'Watchlist not found · PriceTracker' };
  const name = profile.display_name || `@${profile.username}`;
  return {
    title: `${name}'s watchlist · PriceTracker`,
    description: `See the products and target prices ${name} tracks.`
  };
}

export default async function PublicWatchlistPage({ params }: PageProps) {
  const { username } = await params;
  const [{ supabase, profile }, viewer] = await Promise.all([
    findProfile(username),
    getViewer()
  ]);
  if (!profile) notFound();

  const isOwner = viewer?.id === profile.id;
  if (profile.watchlist_visibility !== 'public' && !isOwner) notFound();

  let products: ProductView[] = [];
  try {
    products = await fetchProducts(supabase, profile.id);
  } catch (error) {
    console.error('[public watchlist] could not load products:', error);
  }

  const grouped = new Map<string, ProductView[]>();
  for (const product of products) {
    const category = product.categoryName || 'Uncategorised';
    grouped.set(category, [...(grouped.get(category) || []), product]);
  }
  const groups = [...grouped.entries()].map(([category, items]) => ({
    category,
    products: sortProducts(items)
  }));
  const name = profile.display_name || `@${profile.username}`;

  return (
    <main>
      <DashboardHero
        products={products}
        accountHref={isOwner ? '/account' : '/login'}
        eyebrow={isOwner ? 'Your public watchlist' : 'Public watchlist'}
        title={`${name}'s tracked prices`}
      />
      {profile.bio ? <p className="public-profile-bio">{profile.bio}</p> : null}
      {products.length > 0 ? (
        <CategoryList groups={groups} savedLayout={null} readOnly={!isOwner} />
      ) : (
        <div className="card empty">
          <h2>No tracked products yet</h2>
          <p className="hint">This watchlist is public, but it is currently empty.</p>
        </div>
      )}
    </main>
  );
}
