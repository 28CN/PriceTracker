import ProductThumb from '@/components/ProductThumb';
import RetailerLogo from '@/components/RetailerLogo';
import { formatMoney } from '@/lib/format';
import { productThumb } from '@/lib/productImage';
import { hasCrawlerSupport } from '@/lib/retailer';
import type { ProductView } from '@/lib/types';

const MAX_ITEMS = 8;

type ShowcaseOffer = {
  id: string;
  retailer: string;
  url: string;
  price: number;
};

export type ShowcaseItem = {
  id: string;
  name: string;
  targetPrice: number | null;
  thumb: ReturnType<typeof productThumb>;
  offers: ShowcaseOffer[];
};

export function showcaseItems(products: ProductView[]): ShowcaseItem[] {
  const items: ShowcaseItem[] = [];
  for (const product of products) {
    const offers = product.links
      .filter(
        (link) =>
          link.isActive &&
          link.latestPrice !== null &&
          link.stockStatus !== 'unavailable' &&
          hasCrawlerSupport(link.url || link.retailer)
      )
      .sort((a, b) => (a.latestPrice ?? 0) - (b.latestPrice ?? 0))
      .map((link) => ({
        id: link.id,
        retailer: link.retailer,
        url: link.url,
        price: link.latestPrice as number
      }));
    if (offers.length === 0) continue;
    items.push({
      id: product.id,
      name: product.name,
      targetPrice: product.targetPrice,
      thumb: productThumb(product),
      offers
    });
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

export default function FeaturedShowcase({ products }: { products: ProductView[] }) {
  const items = showcaseItems(products);
  if (items.length === 0) {
    return <p className="hint showcase-empty">Featured prices will show here after the next successful check.</p>;
  }

  return (
    <div className="showcase-list">
      {items.map((item) => (
        <article key={item.id} className="showcase-item">
          <div className="showcase-photo">
            {item.thumb ? <ProductThumb source={item.thumb} /> : null}
          </div>
          <div className="showcase-copy">
            <h3>{item.name}</h3>
            {item.targetPrice !== null ? (
              <p className="showcase-target">Target {formatMoney(item.targetPrice)}</p>
            ) : null}
            <div className="showcase-offers">
              {item.offers.map((offer) => (
                <a
                  key={offer.id}
                  href={offer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <RetailerLogo retailer={offer.retailer} url={offer.url} />
                  <span>{offer.retailer}</span>
                  <strong>{formatMoney(offer.price)}</strong>
                </a>
              ))}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
