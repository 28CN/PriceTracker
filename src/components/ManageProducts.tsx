'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { formatMoney } from '@/lib/format';
import { detectRetailer } from '@/lib/retailer';
import type { ProductView } from '@/lib/types';

function AddLinkRow({ productId, onDone }: { productId: string; onDone: () => void }) {
  const [url, setUrl] = useState('');
  const [retailer, setRetailer] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!url.trim()) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          links: [{ url, retailer: retailer || detectRetailer(url) }]
        })
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Could not add the link.');
      }

      setUrl('');
      setRetailer('');
      onDone();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unknown error');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div className="link-row">
        <input
          type="url"
          inputMode="url"
          placeholder="Add another shop link"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            if (!retailer) {
              setRetailer(detectRetailer(event.target.value));
            }
          }}
        />
        <input
          type="text"
          placeholder="Shop"
          value={retailer}
          onChange={(event) => setRetailer(event.target.value)}
        />
      </div>
      <div className="form-actions">
        <button type="button" className="button" onClick={save} disabled={isSaving || !url.trim()}>
          {isSaving ? 'Adding...' : 'Add link'}
        </button>
      </div>
      {error ? <p className="hint error">{error}</p> : null}
    </div>
  );
}

export default function ManageProducts({ products }: { products: ProductView[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleActive(linkId: string, isActive: boolean) {
    setBusyId(linkId);
    await fetch(`/api/links/${linkId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive })
    }).catch(() => undefined);
    setBusyId(null);
    router.refresh();
  }

  async function removeLink(linkId: string) {
    if (!window.confirm('Remove this link and its price history?')) {
      return;
    }
    setBusyId(linkId);
    await fetch(`/api/links/${linkId}`, { method: 'DELETE' }).catch(() => undefined);
    setBusyId(null);
    router.refresh();
  }

  if (products.length === 0) {
    return (
      <div className="card empty">
        <p className="hint">No products yet.</p>
      </div>
    );
  }

  return (
    <div className="stack">
      {products.map((product) => (
        <article className="card tight" key={product.id}>
          <div className="row">
            <div className="row-main">
              <h3 className="product-name">{product.name}</h3>
              {product.categoryName ? <span className="chip">{product.categoryName}</span> : null}
            </div>
            <div className="price-block">
              <span className="price-note">
                {product.targetPrice === null
                  ? 'No target'
                  : `Target ${formatMoney(product.targetPrice)}`}
              </span>
            </div>
          </div>

          <div className="rows">
            {product.links.map((link) => (
              <div className={`row ${link.isActive ? '' : 'inactive'}`} key={link.id}>
                <div className="row-main">
                  <div className="row-shop">{link.retailer}</div>
                  <div className="row-meta">
                    {link.latestPrice === null ? 'No price yet' : formatMoney(link.latestPrice)}
                    {link.isActive ? '' : ' - paused'}
                  </div>
                </div>
                <div className="row-side">
                  <button
                    type="button"
                    className="button"
                    disabled={busyId === link.id}
                    onClick={() => toggleActive(link.id, !link.isActive)}
                  >
                    {link.isActive ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    type="button"
                    className="button danger"
                    disabled={busyId === link.id}
                    onClick={() => removeLink(link.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            <AddLinkRow productId={product.id} onDone={() => router.refresh()} />
          </div>
        </article>
      ))}
    </div>
  );
}
