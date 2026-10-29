import { BellRing, LineChart, ListPlus, Store } from 'lucide-react';
import Link from 'next/link';

import FeaturedShowcase from '@/components/FeaturedShowcase';
import GlassSurface from '@/components/GlassSurface';
import KangarooPriceAnimation from '@/components/KangarooPriceAnimation';
import RetailerLogo from '@/components/RetailerLogo';
import { SUPPORTED_RETAILERS } from '@/lib/retailer';
import type { ProductView } from '@/lib/types';

export default function GuestLanding({ featured }: { featured: ProductView[] }) {
  return (
    <main className="guest-home">
      <GlassSurface className="guest-hero">
        <div className="guest-hero-copy">
          <span className="eyebrow">Australian price tracking</span>
          <h1>
            <span>Watch the <em>price.</em></span>
            <span>Jump on the <em>deal.</em></span>
          </h1>
          <p>
            Save products from supported retailers, set your target price and keep
            the latest offers together in one watchlist.
          </p>
          <div className="guest-hero-actions">
            <Link className="button" href="/register">Create a free account</Link>
            <Link className="button secondary" href="/login">Sign in</Link>
            {/* POST-only: GET /demo never signs in (login CSRF). */}
            <form action="/demo" method="post" className="demo-form">
              <button className="button secondary" type="submit">Try the demo</button>
            </form>
          </div>
        </div>
        <KangarooPriceAnimation />
      </GlassSurface>

      <section className="guest-steps" aria-label="How PriceTracker works">
        <GlassSurface as="article">
          <ListPlus size={21} />
          <strong>Add a product</strong>
          <span>Paste links from one or more shops.</span>
        </GlassSurface>
        <GlassSurface as="article">
          <LineChart size={21} />
          <strong>Compare prices</strong>
          <span>See the latest price from every tracked retailer.</span>
        </GlassSurface>
        <GlassSurface as="article">
          <BellRing size={21} />
          <strong>Get one useful alert</strong>
          <span>Get alerted when products reach your target (email coming soon).</span>
        </GlassSurface>
      </section>

      <GlassSurface className="guest-retailers">
        <div className="guest-section-heading">
          <div>
            <span className="eyebrow"><Store size={14} /> Supported retailers</span>
            <h2>Track shops you already use</h2>
          </div>
          <span>{SUPPORTED_RETAILERS.length} supported</span>
        </div>
        <div className="retailer-cloud">
          {SUPPORTED_RETAILERS.map((retailer) => (
            <span key={retailer.domain}>
              <RetailerLogo retailer={retailer.name} url={`https://${retailer.domain}`} />
              {retailer.name}
            </span>
          ))}
        </div>
      </GlassSurface>

      <GlassSurface className="guest-featured">
        <span className="eyebrow">Ideas to get started</span>
        <FeaturedShowcase products={featured} />
      </GlassSurface>
    </main>
  );
}
