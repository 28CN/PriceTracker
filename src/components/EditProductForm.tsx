'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { detectRetailer } from '@/lib/retailer';
import type { ProductView } from '@/lib/types';

type Props = {
  product: ProductView;
  onClose: () => void;
};

export default function EditProductForm({ product, onClose }: Props) {
  const router = useRouter();

  const [name, setName] = useState(product.name);
  const [targetPrice, setTargetPrice] = useState(
    product.targetPrice === null ? '' : String(product.targetPrice)
  );
  const [linkDrafts, setLinkDrafts] = useState(
    product.links.map((link) => ({
      id: link.id,
      url: link.url,
      retailer: link.retailer,
      isActive: link.isActive
    }))
  );
  const [newUrl, setNewUrl] = useState('');
  const [newRetailer, setNewRetailer] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function saveProductFields() {
    const response = await fetch(`/api/products/${product.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        targetPrice: targetPrice.trim() === '' ? null : targetPrice
      })
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(data.error || 'Could not update the product.');
    }
  }

  async function saveExistingLinks() {
    for (const draft of linkDrafts) {
      const original = product.links.find((link) => link.id === draft.id);
      if (!original) {
        continue;
      }

      const urlChanged = draft.url.trim() !== original.url;
      const retailerChanged = draft.retailer.trim() !== original.retailer;
      const activeChanged = draft.isActive !== original.isActive;

      if (!urlChanged && !retailerChanged && !activeChanged) {
        continue;
      }

      const response = await fetch(`/api/links/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: draft.url,
          retailer: draft.retailer,
          isActive: draft.isActive
        })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Could not update a shop link.');
      }
    }
  }

  async function addNewLinkIfNeeded() {
    if (!newUrl.trim()) {
      return;
    }

    const response = await fetch('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: product.id,
        links: [{ url: newUrl, retailer: newRetailer || detectRetailer(newUrl) }]
      })
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(data.error || 'Could not add the shop link.');
    }
  }

  async function removeLink(linkId: string) {
    if (!window.confirm('Remove this shop link and its price history?')) {
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/links/${linkId}`, { method: 'DELETE' });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Could not delete the link.');
      }
      setLinkDrafts((current) => current.filter((link) => link.id !== linkId));
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);

    try {
      await saveProductFields();
      await saveExistingLinks();
      await addNewLinkIfNeeded();
      setNewUrl('');
      setNewRetailer('');
      setFeedback({ tone: 'ok', text: 'Saved.' });
      router.refresh();
      onClose();
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="edit-panel" onSubmit={handleSave}>
      <div className="field">
        <label htmlFor={`edit-name-${product.id}`}>Name</label>
        <input
          id={`edit-name-${product.id}`}
          type="text"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor={`edit-target-${product.id}`}>Target price (optional)</label>
        <input
          id={`edit-target-${product.id}`}
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          placeholder="12.00"
          value={targetPrice}
          onChange={(event) => setTargetPrice(event.target.value)}
        />
      </div>

      <p className="section-title" style={{ marginTop: 8 }}>
        Shop links
      </p>

      {linkDrafts.map((link, index) => (
        <div key={link.id} className="edit-link-block">
          <div className="link-row">
            <input
              type="url"
              inputMode="url"
              value={link.url}
              onChange={(event) => {
                const url = event.target.value;
                setLinkDrafts((current) =>
                  current.map((row, position) =>
                    position === index
                      ? {
                          ...row,
                          url,
                          retailer: row.retailer || detectRetailer(url)
                        }
                      : row
                  )
                );
              }}
            />
            <input
              type="text"
              placeholder="Shop"
              value={link.retailer}
              onChange={(event) => {
                const retailer = event.target.value;
                setLinkDrafts((current) =>
                  current.map((row, position) =>
                    position === index ? { ...row, retailer } : row
                  )
                );
              }}
            />
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() =>
                setLinkDrafts((current) =>
                  current.map((row, position) =>
                    position === index ? { ...row, isActive: !row.isActive } : row
                  )
                )
              }
            >
              {link.isActive ? 'Pause' : 'Resume'}
            </button>
            <button
              type="button"
              className="button danger"
              disabled={busy}
              onClick={() => removeLink(link.id)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}

      <p className="hint" style={{ marginTop: 8 }}>
        Add another shop
      </p>
      <div className="link-row">
        <input
          type="url"
          inputMode="url"
          placeholder="https://www.toymate.com.au/..."
          value={newUrl}
          onChange={(event) => {
            setNewUrl(event.target.value);
            if (!newRetailer) {
              setNewRetailer(detectRetailer(event.target.value));
            }
          }}
        />
        <input
          type="text"
          placeholder="Shop"
          value={newRetailer}
          onChange={(event) => setNewRetailer(event.target.value)}
        />
      </div>

      <div className="form-actions" style={{ marginTop: 12 }}>
        <button type="button" className="button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? 'Saving...' : 'Save changes'}
        </button>
      </div>

      {feedback ? (
        <p className={`hint ${feedback.tone === 'error' ? 'error' : 'ok'}`} style={{ marginTop: 8 }}>
          {feedback.text}
        </p>
      ) : null}
    </form>
  );
}
