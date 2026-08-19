'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { detectRetailer } from '@/lib/retailer';
import type { CategoryView } from '@/lib/types';

const MAX_LINKS = 5;

type LinkDraft = { url: string; retailer: string };

const emptyLinks = (): LinkDraft[] => [
  { url: '', retailer: '' },
  { url: '', retailer: '' },
  { url: '', retailer: '' }
];

export default function AddProductForm({ categories }: { categories: CategoryView[] }) {
  const router = useRouter();

  const [categoryId, setCategoryId] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [name, setName] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [links, setLinks] = useState<LinkDraft[]>(emptyLinks);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  function updateLink(index: number, patch: Partial<LinkDraft>) {
    setLinks((current) =>
      current.map((link, position) => {
        if (position !== index) {
          return link;
        }
        const next = { ...link, ...patch };
        // Fill the shop name from the URL unless it has been typed in already.
        if (patch.url !== undefined && !link.retailer) {
          next.retailer = detectRetailer(patch.url);
        }
        return next;
      })
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          categoryId: categoryId || null,
          newCategoryName: categoryId ? null : newCategoryName,
          targetPrice: targetPrice || null,
          links: links.filter((link) => link.url.trim().length > 0)
        })
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Could not save the product.');
      }

      setFeedback({ tone: 'ok', text: 'Saved. It will get a price at the next crawl.' });
      setName('');
      setTargetPrice('');
      setNewCategoryName('');
      setLinks(emptyLinks());
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="category">Category</label>
        <select
          id="category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value="">Create a new one below</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {!categoryId ? (
        <div className="field">
          <label htmlFor="new-category">New category name</label>
          <input
            id="new-category"
            type="text"
            placeholder="Bluey"
            value={newCategoryName}
            onChange={(event) => setNewCategoryName(event.target.value)}
          />
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="product-name">Product name</label>
        <input
          id="product-name"
          type="text"
          required
          placeholder="Bluey Plush Toy"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="target-price">Target price (optional)</label>
        <input
          id="target-price"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          placeholder="12.00"
          value={targetPrice}
          onChange={(event) => setTargetPrice(event.target.value)}
        />
      </div>

      <p className="section-title" style={{ marginTop: 14 }}>
        Shop links (up to {MAX_LINKS})
      </p>

      {links.map((link, index) => (
        <div className="link-row" key={index}>
          <input
            type="url"
            inputMode="url"
            placeholder="https://www.coles.com.au/product/..."
            value={link.url}
            onChange={(event) => updateLink(index, { url: event.target.value })}
          />
          <input
            type="text"
            placeholder="Shop"
            value={link.retailer}
            onChange={(event) => updateLink(index, { retailer: event.target.value })}
          />
        </div>
      ))}

      <div className="form-actions">
        {links.length < MAX_LINKS ? (
          <button
            type="button"
            className="button subtle"
            onClick={() => setLinks((current) => [...current, { url: '', retailer: '' }])}
          >
            + Another link
          </button>
        ) : null}
        <button type="submit" className="button primary" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save product'}
        </button>
      </div>

      {feedback ? (
        <p className={`hint ${feedback.tone === 'error' ? 'error' : 'ok'}`} style={{ marginTop: 10 }}>
          {feedback.text}
        </p>
      ) : null}
    </form>
  );
}
