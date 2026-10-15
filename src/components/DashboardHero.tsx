import { ArrowRight, BadgeDollarSign, Boxes, Store, TrendingDown } from 'lucide-react';
import Link from 'next/link';

import type { ProductView } from '@/lib/types';

export default function DashboardHero({ products }: { products: ProductView[] }) {
  const stores = new Set(
    products.flatMap((product) =>
      product.links.filter((link) => link.isActive).map((link) => link.retailer)
    )
  ).size;
  const deals = products.filter(
    (product) =>
      product.targetPrice !== null &&
      product.lowestPrice !== null &&
      product.lowestPrice <= product.targetPrice
  ).length;

  return (
    <section className="dashboard-hero">
      <div className="hero-copy">
        <span className="eyebrow">
          <TrendingDown size={14} aria-hidden="true" />
          Your price overview
        </span>
        <h1>Spend less time checking, and less money shopping.</h1>
        <p>
          Every saved product, current price and target in one calm, always-current view.
        </p>
        <Link className="button primary hero-action" href="/manage">
          Manage products
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>

      <div className="hero-stats" aria-label="Tracking summary">
        <div className="stat-card">
          <span className="stat-icon"><Boxes size={19} aria-hidden="true" /></span>
          <strong>{products.length}</strong>
          <span>Products</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon"><Store size={19} aria-hidden="true" /></span>
          <strong>{stores}</strong>
          <span>Retailers</span>
        </div>
        <div className="stat-card is-highlight">
          <span className="stat-icon"><BadgeDollarSign size={19} aria-hidden="true" /></span>
          <strong>{deals}</strong>
          <span>At target</span>
        </div>
      </div>

      <svg className="hero-art" viewBox="0 0 420 260" aria-hidden="true">
        <defs>
          <linearGradient id="hero-ribbon" x1="0" y1="1" x2="1" y2="0">
            <stop stopColor="var(--accent-cyan)" stopOpacity=".04" />
            <stop offset=".55" stopColor="var(--brand)" stopOpacity=".18" />
            <stop offset="1" stopColor="var(--brand)" stopOpacity=".05" />
          </linearGradient>
          <radialGradient id="hero-halo">
            <stop stopColor="var(--brand)" stopOpacity=".14" />
            <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="350" cy="55" rx="118" ry="104" fill="url(#hero-halo)" />
        <path
          d="M60 242C142 194 142 130 224 138s100-62 196-96v102c-82 24-117 105-206 91S111 270 60 278Z"
          fill="url(#hero-ribbon)"
        />
        <path
          d="M48 236c87-45 101-103 174-98 86 6 107-65 198-99"
          fill="none"
          stroke="var(--brand)"
          strokeOpacity=".16"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </section>
  );
}
