import { BellRing, LineChart, ListPlus, Store } from 'lucide-react';
import Link from 'next/link';

import CategoryList from '@/components/CategoryList';
import KangarooPriceAnimation from '@/components/KangarooPriceAnimation';
import RetailerLogo from '@/components/RetailerLogo';
import { SUPPORTED_RETAILERS } from '@/lib/retailer';
import type { ProductView } from '@/lib/types';

export default function GuestLanding({ featured }: { featured: ProductView[] }) {
  const groups = featured.length
    ? [{ category: 'Featured price watches', products: featured }]
    : [];

  return (
    <main className="guest-home">
      <section className="guest-hero">
        <div className="guest-hero-copy">
          <span className="eyebrow">Australian price tracking</span>
          <h1>
            <span>Watch the <em>price.</em></span>
            <span>Buy when it’s right.</span>
          </h1>
          <p>
            Save products from supported retailers, set your target price and keep
            the latest offers together in one watchlist.
          </p>
          <div className="guest-hero-actions">
            <Link className="button" href="/register">Create a free account</Link>
            <Link className="button secondary" href="/login">Sign in</Link>
          </div>
        </div>
        <KangarooPriceAnimation />
      </section>

      <section className="guest-steps" aria-label="How PriceTracker works">
        <article><ListPlus size={21} /><strong>Add a product</strong><span>Paste links from one or more shops.</span></article>
        <article><LineChart size={21} /><strong>Compare prices</strong><span>See the latest price from every tracked retailer.</span></article>
        <article><BellRing size={21} /><strong>Get one useful alert</strong><span>Receive a weekly email when products reach your target.</span></article>
      </section>

      <section className="guest-retailers">
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
      </section>

      <section className="guest-featured">
        <div className="guest-section-heading">
          <div>
            <span className="eyebrow">Ideas to get started</span>
            <h2>Featured price watches</h2>
          </div>
        </div>
        {groups.length ? (
          <CategoryList groups={groups} savedLayout={null} readOnly />
        ) : (
          <div className="card empty">
            <p className="hint">Featured products are being prepared.</p>
          </div>
        )}
      </section>
    </main>
  );
}
