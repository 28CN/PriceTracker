import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import CategoryList from '@/components/CategoryList';
import DashboardHero from '@/components/DashboardHero';
import { getViewer, normalizeUsername } from '@/lib/auth';
import { sortProducts } from '@/lib/productSort';
import { isPublicSlugShape } from '@/lib/publicSlug';
import { fetchProducts } from '@/lib/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ProductView } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type PageProps = { params: Promise<{ username: string }> };

type PublicProfile = {
  id: string;
  public_slug: string;
  display_name: string | null;
  bio: string | null;
};

// The path segment is the public name, not the login username.
async function findPublicProfile(slug: string) {
  const supabase = await createServerSupabaseClient();
  if (!isPublicSlugShape(slug)) {
    return { supabase, profile: null };
  }
  const { data, error } = await supabase.rpc('public_profile_by_slug', { candidate: slug });
  if (error) {
    console.error('[public watchlist] could not load profile:', error.message);
    return { supabase, profile: null };
  }
  const row = (Array.isArray(data) ? data[0] : data) as PublicProfile | undefined;
  return { supabase, profile: row?.id ? row : null };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;
  const { profile } = await findPublicProfile(normalizeUsername(username));
  // notFound() here and in the page. This route sits outside (app)/, so no loading.tsx
  // streams first and unknown or private watchlists return a real HTTP 404.
  if (!profile) notFound();
  const name = profile.display_name || profile.public_slug;
  return {
    title: `${name}'s watchlist · PriceTracker`,
    description: `See the products and target prices ${name} tracks.`
  };
}

export default async function PublicWatchlistPage({ params }: PageProps) {
  const { username } = await params;
  const slug = normalizeUsername(username);
  const [{ supabase, profile }, viewer] = await Promise.all([
    findPublicProfile(slug),
    getViewer()
  ]);
  if (!profile) notFound();

  const isOwner = viewer?.id === profile.id;
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
  const name = profile.display_name || profile.public_slug;

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
