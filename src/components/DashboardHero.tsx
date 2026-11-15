'use client';

import { ArrowUpRight, BadgeDollarSign, ChevronRight, UserRound, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

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
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.setAttribute('closedby', 'any');
  }, []);

  function openDialog() {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
  }

  function closeDialog() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
  }

  return (
    <>
      <section className="dashboard-overview">
        <div className="overview-copy">
          <h1>{title}</h1>
        </div>

        <div className="overview-actions">
          <button type="button" className="target-summary" onClick={openDialog} aria-haspopup="dialog">
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
              <span className="account-slot-icon">
                <UserRound size={18} aria-hidden="true" />
              </span>
              <span>
                <strong>Alerts & profile</strong>
              </span>
            </Link>
          ) : null}
        </div>
      </section>

      <dialog
        ref={dialogRef}
        className="deal-dialog"
        aria-labelledby="deal-dialog-title"
        onMouseDown={(event) => {
          const dialog = event.currentTarget;
          const rect = dialog.getBoundingClientRect();
          const inside =
            event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom;
          if (!inside) dialog.close();
        }}
      >
        <header className="deal-dialog-head">
          <h2 id="deal-dialog-title">Below your goal</h2>
          <button type="button" className="icon-button" onClick={closeDialog} aria-label="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="deal-list">
          {deals.map((product) => {
            const bestLink = product.links.find(
              (link) => link.retailer === product.lowestRetailer || link.latestPrice === product.lowestPrice
            );
            const thumb = productThumb(product, bestLink?.id);
            return (
              <article className="deal-row" key={product.id}>
                <ProductVisual source={thumb} name={product.name} category={product.categoryName} />
                <div className="deal-row-main">
                  <strong>{product.name}</strong>
                  <span>
                    {product.categoryName || 'Uncategorised'} · {product.lowestRetailer}
                  </span>
                  <small>Goal {formatMoney(product.targetPrice)}</small>
                </div>
                <div className="deal-row-price">
                  <strong>{formatMoney(product.lowestPrice)}</strong>
                  {bestLink?.url ? (
                    <a href={bestLink.url} target="_blank" rel="noreferrer">
                      Open shop <ArrowUpRight size={13} aria-hidden="true" />
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
      </dialog>
    </>
  );
}
