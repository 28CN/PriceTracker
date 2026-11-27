import type { Metadata } from 'next';
import {
  AppWindow,
  Bookmark,
  BookOpen,
  ChevronDown,
  Copy,
  EllipsisVertical,
  LayoutDashboard,
  Monitor,
  Plus,
  Settings,
  Share,
  Share2,
  Smartphone,
  SquarePlus
} from 'lucide-react';

import InstallButton from '@/components/InstallButton';

export const metadata: Metadata = {
  title: 'Install the app · PriceTracker',
  description: 'Install PriceTracker on your computer or phone. No app store and no extension needed.'
};

const BENEFITS = [
  {
    icon: AppWindow,
    title: 'Its own window and icon',
    body: 'Opens from your desktop or home screen like any other app.'
  },
  {
    icon: LayoutDashboard,
    title: 'Opens straight to your list',
    body: 'Jump directly to your prices without searching through tabs.'
  },
  {
    icon: Share2,
    title: 'Share from shop apps',
    body: 'On Android, tap Share then PriceTracker to add a product.'
  }
];

const QUESTIONS = [
  {
    question: 'Is it safe?',
    answer:
      'It is this website in its own window. No extension and no extra permissions. Your browser installs it, and you can remove it like any app.'
  },
  {
    question: 'Do I need the Chrome Web Store?',
    answer: 'No. Install apps like this come from the website itself; the store is only for extensions.'
  },
  {
    question: 'Does it work on any computer?',
    answer: 'Yes, in Chrome or Edge on Windows, Mac and Chromebook. Safari on Mac: File, then Add to Dock.'
  },
  {
    question: 'How do I uninstall it?',
    answer:
      'Chrome on a computer: open the app, then ⋮ menu, Uninstall PriceTracker. Or go to chrome://apps, right-click it, Remove from Chrome. Edge: go to edge://apps. Android: long-press the icon, then Uninstall or Remove. iPhone: long-press the home-screen icon, then Delete Bookmark or Remove App. It is a web app, so it is not in your Extensions list and cannot change other websites.'
  }
];

export default function InstallPage() {
  return (
    <main className="about-page install-page">
      <header className="about-hero glass-surface">
        <h1>Install PriceTracker</h1>
        <p className="about-lede">
          It is a web app you install from this site: no app store, no browser extension.
        </p>
        <InstallButton />
      </header>

      <section className="about-section glass-surface" aria-label="Benefits">
        <ul className="install-benefits">
          {BENEFITS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.title} className="install-benefit">
                <span className="install-benefit-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <div>
                  <h2>{item.title}</h2>
                  <p>{item.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="about-note">It updates itself; remove it like any app.</p>
      </section>

      <section className="install-platforms" aria-label="Install steps by device">
        <article className="about-section glass-surface install-card is-computer">
          <h2 className="install-card-title">
            <Monitor size={18} aria-hidden="true" />
            Computer: Chrome or Edge
          </h2>
          <ol className="install-steps">
            <li>
              <span className="install-step-text">Click Install at the right of the address bar.</span>
              <div className="install-shot">
                {/* eslint-disable-next-line @next/next/no-img-element -- small pre-sized WebP, lazy below the fold */}
                <img
                  src="/install/desktop-install-icon.webp"
                  width={350}
                  height={66}
                  loading="lazy"
                  decoding="async"
                  alt="Chrome address bar with the Install icon on the right"
                />
              </div>
            </li>
            <li>
              <span className="install-step-text">Click Install.</span>
              <div className="install-shot">
                {/* eslint-disable-next-line @next/next/no-img-element -- small pre-sized WebP, lazy below the fold */}
                <img
                  src="/install/desktop-install-dialog.webp"
                  width={482}
                  height={190}
                  loading="lazy"
                  decoding="async"
                  alt="Browser dialog asking to install PriceTracker with an Install button"
                />
              </div>
            </li>
            <li>
              <span className="install-step-text">PriceTracker opens in its own window.</span>
              <div className="install-shot">
                {/* eslint-disable-next-line @next/next/no-img-element -- small pre-sized WebP, lazy below the fold */}
                <img
                  src="/install/desktop-installed-window.webp"
                  width={1200}
                  height={750}
                  loading="lazy"
                  decoding="async"
                  alt="PriceTracker open in its own desktop window"
                />
              </div>
            </li>
          </ol>
          <p className="about-note">No Install button? Open the browser menu (⋮ or …) and look for Install.</p>
        </article>

        <article className="about-section glass-surface install-card">
          <h2 className="install-card-title">
            <Smartphone size={18} aria-hidden="true" />
            Android: Chrome
          </h2>
          <ol className="install-steps">
            <li>
              <span className="install-step-text">Tap ⋮ at the top right.</span>
            </li>
            <li>
              <span className="install-step-text">Tap Add to Home screen, then Install.</span>
            </li>
            <li>
              <span className="install-step-text">Open PriceTracker from your home screen.</span>
            </li>
          </ol>

          <figure className="install-figure">
            <div className="phone-mock" aria-hidden="true">
              <div className="phone-bar">
                <span className="phone-url">pricetracker-au.vercel.app</span>
                <span className="phone-bar-btn is-active">
                  <EllipsisVertical size={14} />
                </span>
              </div>
              <div className="phone-screen">
                <div className="phone-menu">
                  <div className="phone-row">
                    <Plus size={13} />
                    <span>New tab</span>
                  </div>
                  <div className="phone-row">
                    <Bookmark size={13} />
                    <span>Bookmarks</span>
                  </div>
                  <div className="phone-row is-highlight">
                    <SquarePlus size={13} />
                    <span>Add to Home screen</span>
                  </div>
                  <div className="phone-row">
                    <Settings size={13} />
                    <span>Settings</span>
                  </div>
                </div>
              </div>
            </div>
            <figcaption>Illustration</figcaption>
          </figure>
        </article>

        <article className="about-section glass-surface install-card">
          <h2 className="install-card-title">
            <Smartphone size={18} aria-hidden="true" />
            iPhone and iPad: Safari
          </h2>
          <ol className="install-steps">
            <li>
              <span className="install-step-text">Tap Share (the square with an arrow).</span>
            </li>
            <li>
              <span className="install-step-text">Tap Add to Home Screen.</span>
            </li>
            <li>
              <span className="install-step-text">Tap Add.</span>
            </li>
          </ol>

          <figure className="install-figure">
            <div className="phone-mock" aria-hidden="true">
              <div className="phone-screen phone-screen-ios">
                <div className="phone-sheet">
                  <div className="phone-sheet-handle" />
                  <div className="phone-row">
                    <Copy size={13} />
                    <span>Copy</span>
                  </div>
                  <div className="phone-row">
                    <BookOpen size={13} />
                    <span>Add to Reading List</span>
                  </div>
                  <div className="phone-row is-highlight">
                    <SquarePlus size={13} />
                    <span>Add to Home Screen</span>
                  </div>
                  <div className="phone-row">
                    <Bookmark size={13} />
                    <span>Add Bookmark</span>
                  </div>
                </div>
              </div>
              <div className="phone-toolbar">
                <span className="phone-bar-btn is-active">
                  <Share size={14} />
                </span>
              </div>
            </div>
            <figcaption>Illustration</figcaption>
          </figure>
        </article>
      </section>

      <section className="about-section glass-surface" aria-labelledby="install-faq">
        <h2 id="install-faq">Questions</h2>
        <div className="install-faq-list">
          {QUESTIONS.map((item) => (
            <details key={item.question} className="install-qa">
              <summary className="install-qa-summary">
                <span>{item.question}</span>
                <ChevronDown size={16} className="install-qa-chevron" aria-hidden="true" />
              </summary>
              <p className="install-qa-answer">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
