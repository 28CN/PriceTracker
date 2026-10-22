'use client';

import { useState } from 'react';

import { formatMoney } from '@/lib/format';

const HINT = 'Last price check was more than 7 days ago. Show the saved price.';

export default function ExpiredPrice({
  price,
  revealedClassName = '',
  nested = false
}: {
  price: number;
  revealedClassName?: string;
  /** True when this control sits inside the product-card button. */
  nested?: boolean;
}) {
  const [shown, setShown] = useState(false);

  if (shown) {
    return <span className={revealedClassName}>{formatMoney(price)}</span>;
  }

  function reveal(event: React.MouseEvent | React.KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();
    setShown(true);
  }

  if (nested) {
    return (
      <span
        role="button"
        tabIndex={0}
        data-reveal-price=""
        className="stale-price"
        title={HINT}
        onClick={reveal}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') reveal(event);
        }}
      >
        Expired
      </span>
    );
  }

  return (
    <button type="button" className="stale-price" title={HINT} onClick={reveal}>
      Expired
    </button>
  );
}
