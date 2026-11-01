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
          <h1>
            <span>Watch the <em>price.</em></span>
            <span>Jump on the <em>deal.</em></span>
          </h1>
          <div className="guest-hero-actions">
            <Link className="button" href="/register">Create a free account</Link>
            <Link className="button secondary" href="/login">Sign in</Link>
            {/* POST-only: GET /demo never signs in (login CSRF). */}
            <form action="/demo" method="post" className="demo-form">
              <button className="button secondary" type="submit">See an example</button>
            </form>
          </div>
        </div>
        <KangarooPriceAnimation />
      </GlassSurface>

      <section className="guest-steps" aria-label="How PriceTracker works">
        <GlassSurface as="article">
          <ListPlus size={21} />
          <strong>Add a product</strong>
        </GlassSurface>
        <GlassSurface as="article">
          <LineChart size={21} />
          <strong>Compare prices</strong>
        </GlassSurface>
        <GlassSurface as="article">
          <BellRing size={21} />
          <strong>Get the deal</strong>
        </GlassSurface>
      </section>

      <GlassSurface className="guest-retailers">
        <div className="guest-section-heading">
          <div>
            <h2><Store size={18} aria-hidden="true" /> Shops we check</h2>
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
        <h2>Popular picks</h2>
        <FeaturedShowcase products={featured} />
      </GlassSurface>
    </main>
  );
}
