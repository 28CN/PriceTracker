'use client';

import { ArrowRight, Tag } from 'lucide-react';
import Link from 'next/link';

import RetailerLogo from '@/components/RetailerLogo';
import { DEAL_SHOPS } from '@/lib/deals';
import { useForYou } from '@/lib/useForYou';

/** Small dashboard card: deals for you since your last Deals visit. Hidden when there are none. */
export default function ForYouDigest() {
  const forYou = useForYou(true);
  if (!forYou || forYou.count === 0) return null;

  return (
    <section className="for-you glass-surface" aria-labelledby="for-you-title">
      <header className="for-you-head">
        <h2 id="for-you-title">
          <Tag size={16} aria-hidden="true" />
          New deals for you
          <span className="for-you-count">{forYou.count}</span>
        </h2>
        <Link href="/deals?mine=1" className="for-you-all">
          See all
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </header>
      <ul>
        {forYou.items.map((item) => {
          const shop = DEAL_SHOPS.find((entry) => entry.key === item.shop);
          return (
            <li key={item.id}>
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="for-you-item">
                <span className="for-you-shop" aria-hidden="true">
                  <RetailerLogo retailer={shop?.name ?? item.shop} url={shop ? `https://${shop.domain}` : null} />
                </span>
                <span className="for-you-title">{item.title}</span>
                <span className={`for-you-tag${item.kind === 'item' ? ' is-item' : ''}`}>{item.label}</span>
                <span className="sr-only"> (opens OzBargain)</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
