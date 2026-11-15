'use client';

import { useState } from 'react';

import { formatMoney } from '@/lib/format';

const HINT = 'The last check was more than a week ago. This shows the saved price.';

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
    return (
      <span className="stale-revealed">
        <span className={revealedClassName}>{formatMoney(price)}</span>
        <span className="rail-when">Last saved price</span>
      </span>
    );
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
        Show last price
      </span>
    );
  }

  return (
    <button type="button" className="stale-price" aria-label={`Show last price. ${HINT}`} onClick={reveal}>
      Show last price
    </button>
  );
}
