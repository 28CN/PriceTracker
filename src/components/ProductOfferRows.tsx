'use client';

import { ExternalLink } from 'lucide-react';

import RetailerLogo from '@/components/RetailerLogo';
import { resolveCardPrice, shopGapLabel } from '@/lib/cardState';
import { formatCheckedAt, formatLastSeen, formatMoney } from '@/lib/format';
import { hasCrawlerSupport, retailerKey } from '@/lib/retailer';
import type { ProductView } from '@/lib/types';

function CheckedOn({ iso }: { iso: string }) {
  const label = formatCheckedAt(iso);
  if (!label) return null;
  return (
    <span className="rail-when">
      Checked <time dateTime={iso}>{label}</time>
    </span>
  );
}

function LastSeen({ iso }: { iso: string | null | undefined }) {
  const label = formatLastSeen(iso);
  if (!label || !iso) return null;
  return (
    <span className="price-last-seen">
      Last seen <time dateTime={iso}>{label}</time>
    </span>
  );
}

export default function ProductOfferRows({
  product,
  readOnly = false
}: {
  product: ProductView;
  readOnly?: boolean;
}) {
  const { cheapestFreshLink, freshOffers } = resolveCardPrice({
    links: product.links,
    checkState: product.checkState
  });
  const lowestFreshPrice = cheapestFreshLink?.latestPrice ?? null;
  const saving = shopGapLabel(freshOffers, formatMoney) !== null;

  if (product.links.length === 0) {
    return <p className="hint">{readOnly ? 'No shop links are available.' : 'No shop links yet.'}</p>;
  }

  return (
    <>
      {product.links.map((link) => {
        const isStalePrice =
          link.priceStale && link.stockStatus !== 'unavailable' && link.latestPrice !== null;
        const isCheapestFresh =
          link.isActive &&
          !link.priceStale &&
          link.stockStatus !== 'unavailable' &&
          lowestFreshPrice !== null &&
          link.latestPrice === lowestFreshPrice;
        const showCheapestTag = saving && isCheapestFresh;
        const shopSlug = retailerKey(link.url || link.retailer);

        return (
          <div
            key={link.id}
            className={`row ${link.isActive ? '' : 'inactive'}${showCheapestTag ? ' is-best' : ''}`}
            data-shop={shopSlug ?? undefined}
          >
            <div className="row-main">
              <div className="row-shop">
                <span className="shop-dot" aria-hidden="true" />
                <RetailerLogo retailer={link.retailer} url={link.url} />
                <span>{link.retailer}</span>
                {showCheapestTag ? <span className="best-tag">Cheapest</span> : null}
                {!hasCrawlerSupport(link.url || link.retailer) ? (
                  <span className="shop-gap">Not checked here</span>
                ) : null}
              </div>
              {!link.isActive ? (
                <div className="row-meta">Paused</div>
              ) : isStalePrice ? null : (
                <div className="row-meta">
                  {link.latestAt && formatCheckedAt(link.latestAt) ? (
                    <CheckedOn iso={link.latestAt} />
                  ) : (
                    'Not checked yet'
                  )}
                </div>
              )}
            </div>
            <div className="row-side">
              {isStalePrice ? (
                <span className="row-price-stale">
                  <span className="row-price is-stale">{formatMoney(link.latestPrice)}</span>
                  <LastSeen iso={link.latestAt} />
                </span>
              ) : (
                <span
                  className={`row-price ${
                    link.stockStatus === 'unavailable'
                      ? 'unavailable'
                      : link.latestPrice === null
                        ? 'none'
                        : isCheapestFresh
                          ? 'best'
                          : ''
                  }`}
                >
                  {link.stockStatus === 'unavailable'
                    ? 'Unavailable'
                    : link.latestPrice === null
                      ? 'No price yet'
                      : formatMoney(link.latestPrice)}
                </span>
              )}
              {link.url ? (
                <a className="open-link" href={link.url} target="_blank" rel="noreferrer">
                  Open shop <ExternalLink size={16} aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </div>
        );
      })}
    </>
  );
}
