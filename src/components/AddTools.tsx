'use client';

import { BookmarkPlus, ExternalLink, Tag } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import InfoTip from '@/components/InfoTip';
import RetailerLogo from '@/components/RetailerLogo';
import { bookmarkletFor, SPECIALS_LINKS } from '@/lib/addTools';

/** This week's sale pages, plus a bookmark that adds the page you are on. */
export default function AddTools() {
  const bookmarkRef = useRef<HTMLAnchorElement>(null);
  const [showHow, setShowHow] = useState(false);

  // React refuses javascript: links in props, so set it once on the element.
  useEffect(() => {
    bookmarkRef.current?.setAttribute('href', bookmarkletFor(window.location.origin));
  }, []);

  return (
    <section className="add-tools" aria-label="Find products to add">
      <div className="add-tools-row">
        <h2 className="add-tools-title">
          <Tag size={14} aria-hidden="true" />
          This week&rsquo;s specials
        </h2>
        <ul className="specials-links">
          {SPECIALS_LINKS.map((link) => (
            <li key={link.href}>
              <a className="specials-link" href={link.href} target="_blank" rel="noopener noreferrer">
                <RetailerLogo retailer={link.shop} url={link.href} />
                <span className="specials-link-shop">{link.shop}</span>
                <span className="specials-link-label">{link.label}</span>
                <ExternalLink size={12} aria-hidden="true" />
                <span className="sr-only">(opens the shop)</span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="add-tools-row add-tools-bookmark">
        <h2 className="add-tools-title">
          Add from any shop
          <InfoTip label="How the add button works">
            Drag the button to your bookmarks bar. On a product page, click it.
          </InfoTip>
        </h2>
        <a
          ref={bookmarkRef}
          className="button bookmarklet-button"
          href="#add-to-pricetracker"
          draggable
          onClick={(event) => {
            event.preventDefault();
            setShowHow(true);
          }}
        >
          <BookmarkPlus size={15} aria-hidden="true" />
          Add to PriceTracker
        </a>
        {showHow ? (
          <p className="hint" role="status">
            Drag it to your bookmarks bar first.
          </p>
        ) : null}
      </div>
    </section>
  );
}
