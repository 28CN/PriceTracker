'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUpRight,
  BadgeDollarSign,
  CheckCircle2,
  ChevronRight,
  UserRound,
  X
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import ProductVisual from '@/components/ProductVisual';
import { formatMoney } from '@/lib/format';
import { productThumb } from '@/lib/productImage';
import type { ProductView } from '@/lib/types';

export default function DashboardHero({
  products,
  accountHref,
  title = 'Your tracked prices'
}: {
  products: ProductView[];
  accountHref: string | null;
  title?: string;
}) {
  const deals = products.filter(
    (product) =>
      product.targetPrice !== null &&
      product.lowestPrice !== null &&
      product.lowestPrice <= product.targetPrice
  );
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isOpen]);

  return (
    <>
      <section className="dashboard-overview">
        <div className="overview-copy">
          <h1>{title}</h1>
      </div>

        <div className="overview-actions">
          <button
            type="button"
            className="target-summary"
            onClick={() => setIsOpen(true)}
            aria-haspopup="dialog"
          >
            <span className="target-summary-icon">
              <BadgeDollarSign size={20} aria-hidden="true" />
            </span>
            <span className="target-summary-copy">
              <strong>{deals.length} below goal</strong>
            </span>
            <ChevronRight className="target-summary-arrow" size={18} aria-hidden="true" />
          </button>

          {accountHref ? (
          <Link className="account-slot" href={accountHref}>
            <span className="account-slot-icon"><UserRound size={18} aria-hidden="true" /></span>
            <span>
              <strong>Alerts & profile</strong>
              <small>Privacy and notifications</small>
            </span>
          </Link>
          ) : null}
        </div>
      </section>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="deal-dialog-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsOpen(false);
            }}
          >
            <motion.section
              className="deal-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="deal-dialog-title"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              <header className="deal-dialog-head">
                <div>
                  <span className="eyebrow"><CheckCircle2 size={14} /> Ready to buy</span>
                  <h2 id="deal-dialog-title">Below your goal</h2>
                  <p>{deals.length} {deals.length === 1 ? 'product is' : 'products are'} at or below your goal.</p>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close"
                  title="Close"
                  autoFocus
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </header>

              <div className="deal-list">
                {deals.map((product) => {
                  const bestLink = product.links.find(
                    (link) =>
                      link.retailer === product.lowestRetailer ||
                      link.latestPrice === product.lowestPrice
                  );
                  const thumb = productThumb(product, bestLink?.id);
                  return (
                    <article className="deal-row" key={product.id}>
                      <ProductVisual
                        source={thumb}
                        name={product.name}
                        category={product.categoryName}
                      />
                      <div className="deal-row-main">
                        <strong>{product.name}</strong>
                        <span>{product.categoryName || 'Uncategorised'} · {product.lowestRetailer}</span>
                        <small>Goal {formatMoney(product.targetPrice)}</small>
                      </div>
                      <div className="deal-row-price">
                        <strong>{formatMoney(product.lowestPrice)}</strong>
                        {bestLink?.url ? (
                          <a href={bestLink.url} target="_blank" rel="noreferrer">
                            Shop <ArrowUpRight size={13} aria-hidden="true" />
                          </a>
                        ) : null}
                      </div>
                    </article>
                  );
                })}

                {deals.length === 0 ? (
                  <div className="deal-empty">
                    <BadgeDollarSign size={30} aria-hidden="true" />
                    <strong>Nothing below goal yet</strong>
                  </div>
                ) : null}
              </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
