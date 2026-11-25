import type { Metadata } from 'next';
import Link from 'next/link';

import { getViewer } from '@/lib/auth';
import { SUPPORTED_RETAILERS } from '@/lib/retailer';

export const metadata: Metadata = {
  title: 'About · PriceTracker',
  description: 'How PriceTracker is built: architecture, measured speed, tests and design decisions.'
};

const REPO_URL = 'https://github.com/28CN/PriceTracker';

// Numbers are measured, not estimated. Update the date when they are re-run.
const MEASURED_ON = '25 Nov 2026';

const SPEED = [
  { page: 'Home page', desktop: '1.5 s', phone: '1.3 s' },
  { page: 'Example list after sign-in', desktop: '2.5 s', phone: '2.2 s' }
];

const TESTS = [
  { kind: 'Unit and route tests (Vitest)', count: '273' },
  { kind: 'Database checks (pgTAP: access rules, triggers)', count: '80' },
  { kind: 'Crawler tests (pytest)', count: '11' },
  { kind: 'Database migrations, re-applied in CI', count: '22' }
];

const DECISIONS = [
  {
    title: 'The database decides who sees what',
    body: 'Every table has row-level security. Pages read with the signed-in person’s own session, so a bug in a page cannot show someone else’s list.',
    cost: 'Access rules need careful review, so CI tests them.'
  },
  {
    title: 'Free scheduled jobs instead of a queue',
    body: 'GitHub Actions checks prices twice a week, or when asked. Logs and screenshots are kept for each run.',
    cost: 'A check takes a few minutes to start.'
  },
  {
    title: 'Old prices stay visible',
    body: 'A price older than a week is shown muted with “Last seen” and its date. The cheapest shop only uses fresh prices.',
    cost: 'Cards carry one extra line.'
  },
  {
    title: 'A read-only example account',
    body: 'Anyone can try the site without signing up. The database blocks every change by that account.',
    cost: 'Its sample list has to be kept up to date.'
  },
  {
    title: 'Shops that block robots are checked from a home PC',
    body: 'Some shops refuse cloud browsers. Those are checked on a schedule from a desktop instead of paying for proxies.',
    cost: 'Those prices depend on that PC being on.'
  },
  {
    title: 'Email is off by a database switch',
    body: 'A database trigger refuses to queue mail while email is off, even if some code forgets to check.',
    cost: 'Turning it on is a database change, not a button.'
  }
];

export default async function AboutPage() {
  // Signed-in people already have a list; the example would sign them out of it.
  const viewer = await getViewer();

  return (
    <main className="about-page">
      <header className="about-hero glass-surface">
        <p className="about-kicker">Case study</p>
        <h1>How PriceTracker works</h1>
        <p className="about-lede">
          It watches prices at {SUPPORTED_RETAILERS.length} Australian shops and shows the cheapest one, how it compares
          with the usual price, and when it drops below your goal.
        </p>
        <div className="about-actions">
          {viewer ? (
            <Link className="button primary" href="/">
              My list
            </Link>
          ) : (
            <form action="/demo" method="post" className="demo-form">
              <button className="button primary" type="submit">
                View example
              </button>
            </form>
          )}
          <a className="button" href={REPO_URL} target="_blank" rel="noreferrer">
            Source code
          </a>
        </div>
      </header>

      <section className="about-section glass-surface" aria-labelledby="about-shots">
        <h2 id="about-shots">Screenshots</h2>
        <div className="about-shots">
          <figure className="about-shot about-shot-wide">
            {/* eslint-disable-next-line @next/next/no-img-element -- small pre-sized WebP, lazy below the fold */}
            <img
              src="/about/dashboard-desktop-light.webp"
              width={1440}
              height={900}
              loading="lazy"
              decoding="async"
              alt="Example list on a laptop: summary tiles, product cards with the cheapest shop, and a price chart beside them"
            />
            <figcaption>Laptop, light theme</figcaption>
          </figure>
          <figure className="about-shot about-shot-phone">
            {/* eslint-disable-next-line @next/next/no-img-element -- small pre-sized WebP, lazy below the fold */}
            <img
              src="/about/dashboard-phone-dark.webp"
              width={780}
              height={1688}
              loading="lazy"
              decoding="async"
              alt="Example list on a phone in the dark theme"
            />
            <figcaption>Phone, dark theme</figcaption>
          </figure>
        </div>
      </section>

      <section className="about-section glass-surface" aria-labelledby="about-arch">
        <h2 id="about-arch">How it fits together</h2>
        <ol className="about-arch">
          <li>
            <strong>Website</strong>
            <span>Next.js on Vercel (Tokyo)</span>
          </li>
          <li>
            <strong>Accounts and prices</strong>
            <span>Supabase Postgres, row-level security on every table</span>
          </li>
          <li>
            <strong>Price checks</strong>
            <span>Python and Playwright, run by GitHub Actions</span>
          </li>
          <li>
            <strong>Tests on every change</strong>
            <span>Types, lint, unit, crawler and database tests in CI</span>
          </li>
        </ol>
        <p className="about-note">
          Each price check adds a row to the price history. History is never deleted, so charts and “usual price” use
          every check.
        </p>
      </section>

      <section className="about-section glass-surface" aria-labelledby="about-speed">
        <h2 id="about-speed">Measured speed</h2>
        <div className="about-table-wrap">
          <table className="about-table">
            <caption>Time until the main content shows (median of 5 loads)</caption>
            <thead>
              <tr>
                <th scope="col">Page</th>
                <th scope="col">Laptop width</th>
                <th scope="col">Phone width</th>
              </tr>
            </thead>
            <tbody>
              {SPEED.map((row) => (
                <tr key={row.page}>
                  <th scope="row">{row.page}</th>
                  <td>{row.desktop}</td>
                  <td>{row.phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="about-note">
          Measured on {MEASURED_ON} on the live site with headless Chrome on a fast connection (Largest Contentful
          Paint). The sign-in time includes signing in. Layout shift stayed under 0.01. Phones on mobile data will be
          slower.
        </p>
      </section>

      <section className="about-section glass-surface" aria-labelledby="about-tests">
        <h2 id="about-tests">Tests</h2>
        <ul className="about-counts">
          {TESTS.map((row) => (
            <li key={row.kind}>
              <b>{row.count}</b>
              <span>{row.kind}</span>
            </li>
          ))}
        </ul>
        <p className="about-note">
          Counted on {MEASURED_ON}. CI also compares the database rules with production and fails if they differ.
        </p>
      </section>

      <section className="about-section glass-surface" aria-labelledby="about-decisions">
        <h2 id="about-decisions">Design decisions</h2>
        <ul className="about-decisions">
          {DECISIONS.map((item) => (
            <li key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <p className="about-cost">Trade-off: {item.cost}</p>
            </li>
          ))}
        </ul>
      </section>

    </main>
  );
}
