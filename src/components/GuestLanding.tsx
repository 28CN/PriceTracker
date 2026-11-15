import Link from 'next/link';
import { Store } from 'lucide-react';

import InfoTip from '@/components/InfoTip';
import RetailerLogo from '@/components/RetailerLogo';
import { SUPPORTED_RETAILERS } from '@/lib/retailer';

export default function GuestLanding() {
  return (
    <main className="guest-home">
      <section className="guest-hero glass-surface">
        <div className="guest-hero-copy">
          <h1>
            <span>
              Watch the <em>price.</em>
            </span>
            <span>
              Jump on the <em>deal.</em>
            </span>
          </h1>
          <div className="guest-hero-actions">
            <Link className="button primary" href="/register">
              Start tracking
            </Link>
            <form action="/demo" method="post" className="demo-form">
              <button className="button" type="submit">
                View example
              </button>
            </form>
            <Link className="button" href="/login">
              Sign in
            </Link>
          </div>
        </div>

        <figure className="example-card">
          <figcaption>
            Example
            <InfoTip label="About this example">Sample prices. Not a live check, and not someone&apos;s list.</InfoTip>
          </figcaption>
          <div className="example-card-top">
            <div>
              <strong>Kitchen cleaner, 500 ml</strong>
              <span className="goal-line">Goal $30.00</span>
            </div>
            <b>$22.99</b>
          </div>
          <svg className="example-trend" viewBox="0 0 280 72" role="img" aria-label="Sample price falling, then holding">
            <polyline points="8,18 70,22 120,48 180,40 270,58" />
          </svg>
          <ul>
            <li>
              <RetailerLogo retailer="Coles" url="https://coles.com.au" />
              <span>Coles</span>
              <b>$22.99</b>
            </li>
            <li>
              <RetailerLogo retailer="Woolworths" url="https://woolworths.com.au" />
              <span>Woolworths</span>
              <b>$26.50</b>
            </li>
          </ul>
          <p className="rail-when">Checked Wed, 4 Nov 2026</p>
        </figure>
      </section>

      <section className="guest-retailers glass-surface" aria-label="Shops we check">
        <div className="guest-section-heading">
          <h2>
            <Store size={18} aria-hidden="true" /> Shops we check
          </h2>
          <span>{SUPPORTED_RETAILERS.length} shops</span>
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
    </main>
  );
}
