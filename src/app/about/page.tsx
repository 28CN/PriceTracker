import type { Metadata } from 'next';
import Link from 'next/link';
import { Download } from 'lucide-react';

import { getViewer } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Guide · PriceTracker',
  description: 'How to use PriceTracker: add products, set a Goal, read the chart, compare shops, deals and the app.'
};

const JUMP_LINKS = [
  { href: '#start', label: 'Get started' },
  { href: '#goal', label: 'Set a Goal' },
  { href: '#chart', label: 'Price chart' },
  { href: '#compare', label: 'Compare' },
  { href: '#deals', label: 'Deals' },
  { href: '#add-from-shops', label: 'Add from a shop' },
  { href: '#install', label: 'Install the app' }
];

const CHART_LABELS = [
  {
    name: 'Real discount',
    tone: 'is-good',
    detail: 'Below the usual price.'
  },
  {
    name: 'Raised before the drop',
    tone: 'is-warn',
    detail: 'The shop put the price up first, so the drop is not a real saving.'
  },
  {
    name: 'Usual price',
    tone: 'is-neutral',
    detail: 'In line with the normal price at that shop.'
  },
  {
    name: 'Not enough history yet',
    tone: 'is-muted',
    detail: 'Needs more weekly checks before calling a discount.'
  }
];

export default async function GuidePage() {
  const viewer = await getViewer();

  return (
    <main className="about-page guide-page">
      <header className="about-hero glass-surface">
        <h1>How to use PriceTracker</h1>
        <p className="about-lede">
          Add the products you buy, set a Goal price and see when a shop has a real saving.
        </p>
        <div className="about-actions">
          {viewer ? (
            <Link className="button primary" href="/">
              My list
            </Link>
          ) : (
            <>
              <Link className="button primary" href="/register">
                Start tracking
              </Link>
              <form action="/demo" method="post" className="demo-form">
                <button className="button" type="submit">
                  View example
                </button>
              </form>
            </>
          )}
        </div>
      </header>

      <nav className="guide-jump" aria-label="Guide sections">
        {JUMP_LINKS.map((item) => (
          <a key={item.href} className="guide-jump-link" href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>

      <div className="guide-grid">
        <section id="start" className="about-section glass-surface guide-section" aria-labelledby="guide-start">
          <h2 id="guide-start">Get started</h2>
          <ol className="guide-steps">
            <li>Make a free account, or try the example list first.</li>
            <li>
              On <strong>Add</strong>, paste a link to a product page from a shop, or search the shops by name.
            </li>
            <li>
              Prices are checked twice a week. Each card shows the cheapest shop and when the price was last checked.
            </li>
          </ol>
        </section>

        <section id="goal" className="about-section glass-surface guide-section" aria-labelledby="guide-goal">
          <h2 id="guide-goal">Set a Goal</h2>
          <div className="guide-copy">
            <p>Your Goal is the price you would be happy to pay.</p>
            <p>
              When a shop&rsquo;s current price is at or under it, the card shows{' '}
              <span className="guide-tag is-good">Below goal</span> in green and it counts in the{' '}
              <strong>Below goal</strong> tile at the top of your list.
            </p>
            <p>
              To change it, open the card and tap <strong>Edit</strong>.
            </p>
          </div>
        </section>

        <section
          id="chart"
          className="about-section glass-surface guide-section guide-span-2"
          aria-labelledby="guide-chart"
        >
          <h2 id="guide-chart">Read the price chart</h2>
          <div className="guide-chart-layout">
            <div className="guide-copy">
              <p>Open a card to see its chart.</p>
              <p>
                The solid line is the lowest price each sale week. The dashed line is the usual price at the cheapest
                shop.
              </p>
              <p className="about-note">
                A price older than a week is shown faded with <strong>Last seen</strong> and its date.
              </p>
            </div>
            <ul className="guide-labels">
              {CHART_LABELS.map((item) => (
                <li key={item.name}>
                  <span className={`guide-tag ${item.tone}`}>{item.name}</span>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="compare" className="about-section glass-surface guide-section" aria-labelledby="guide-compare">
          <h2 id="guide-compare">Compare Coles and Woolworths</h2>
          <div className="guide-copy">
            <p>
              <strong>Compare</strong> puts everything on your list that both shops sell side by side.
            </p>
            <p>It shows prices per kg, litre or item where the size is known, and the total for each shop.</p>
          </div>
        </section>

        <section id="deals" className="about-section glass-surface guide-section" aria-labelledby="guide-deals">
          <h2 id="guide-deals">Deals</h2>
          <div className="guide-copy">
            <p>Bargains posted on OzBargain for the shops we check and big online shops.</p>
            <p>
              Filter by shop, sort by newest or most votes. <strong>On my list</strong> marks deals that match
              something you track.
            </p>
            <p>A deal opens on OzBargain; the shop name opens the shop&rsquo;s website.</p>
          </div>
        </section>

        <section
          id="add-from-shops"
          className="about-section glass-surface guide-section guide-span-2"
          aria-labelledby="guide-add-from-shops"
        >
          <h2 id="guide-add-from-shops">Add straight from a shop</h2>
          <div className="guide-devices">
            <div className="guide-device-card">
              <h3>Computer</h3>
              <p>
                On the <strong>Add</strong> page, drag the <strong>Add to PriceTracker</strong> button to your
                bookmarks bar, then click it on any product page.
              </p>
            </div>

            <div className="guide-device-card">
              <h3>Android</h3>
              <p>
                Install the app (see below), then in a shop&rsquo;s app or Chrome tap <strong>Share</strong>, then{' '}
                <strong>PriceTracker</strong>.
              </p>
            </div>

            <div className="guide-device-card">
              <h3>iPhone and iPad</h3>
              <ol className="guide-steps is-compact">
                <li>
                  In <strong>Shortcuts</strong> tap <strong>+</strong>, name it <strong>Add to PriceTracker</strong>,
                  and turn on <strong>Show in Share Sheet</strong> for URLs.
                </li>
                <li>
                  Add <strong>URL Encode</strong> with <strong>Shortcut Input</strong>.
                </li>
                <li>
                  Add <strong>Open URLs</strong> with{' '}
                  <code className="guide-code">https://pricetracker-au.vercel.app/add?url=</code> followed by the
                  encoded text.
                </li>
                <li>
                  In Safari, tap <strong>Share</strong>, then <strong>Add to PriceTracker</strong>.
                </li>
              </ol>
            </div>
          </div>
        </section>

        <section
          id="install"
          className="about-section glass-surface guide-section guide-span-2 guide-install-banner"
          aria-labelledby="guide-install"
        >
          <div>
            <h2 id="guide-install">Install the app</h2>
            <p className="guide-install-text">
              Put PriceTracker on your computer or phone home screen with no app store and no browser extension.
            </p>
          </div>
          <Link className="button" href="/install">
            <Download size={16} aria-hidden="true" />
            How to install
          </Link>
        </section>
      </div>

      <p className="guide-built-link">
        <Link href="/about/built">How PriceTracker is built</Link>
      </p>
    </main>
  );
}
