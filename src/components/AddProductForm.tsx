'use client';

import { Link2, LoaderCircle, Plus, Save, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ClipboardEvent, type DragEvent } from 'react';

import InfoTip from '@/components/InfoTip';
import RetailerLogo from '@/components/RetailerLogo';
import { cleanHttpUrl, firstUrlIn } from '@/lib/productUrl';
import { detectRetailer, retailerKey, SUPPORTED_RETAILERS } from '@/lib/retailer';
import type { CategoryView } from '@/lib/types';

const MAX_LINKS = 20;

const SUPPORTED_BY_KEY = new Map(
  SUPPORTED_RETAILERS.map((shop) => [retailerKey(shop.name), shop] as const).filter(
    (entry): entry is readonly [string, (typeof SUPPORTED_RETAILERS)[number]] => entry[0] !== null
  )
);

function supportedShopForUrl(rawUrl: string): { name: string; domain: string } | null {
  const trimmed = rawUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  const key = retailerKey(trimmed);
  return key ? (SUPPORTED_BY_KEY.get(key) ?? null) : null;
}

type LinkDraft = { url: string; retailer: string };

const emptyLinks = (): LinkDraft[] => [
  { url: '', retailer: '' },
  { url: '', retailer: '' },
  { url: '', retailer: '' }
];

function startingLinks(url?: string): LinkDraft[] {
  const links = emptyLinks();
  if (url) links[0] = { url, retailer: detectRetailer(url) };
  return links;
}

/** A link from a drag or a paste: the URL list first, then plain text. */
function linkFromTransfer(data: DataTransfer | null): string | null {
  if (!data) return null;
  const uriLine = data
    .getData('text/uri-list')
    .split(/\r?\n/)
    .find((line) => line.trim() && !line.startsWith('#'));
  return firstUrlIn(uriLine || '') || firstUrlIn(data.getData('text/plain') || '');
}

function isLinkInput(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement && target.type === 'url';
}

export default function AddProductForm({
  categories,
  initialUrl,
  initialName = '',
  readOnly = false,
  savedHref
}: {
  categories: CategoryView[];
  initialUrl?: string;
  initialName?: string;
  /** The sample watchlist: show the form, but saving is off. */
  readOnly?: boolean;
  /** Where to go after saving, e.g. back to the list from /add. */
  savedHref?: string;
}) {
  const router = useRouter();

  const [categoryId, setCategoryId] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [name, setName] = useState(initialName);
  const [targetPrice, setTargetPrice] = useState('');
  const [links, setLinks] = useState<LinkDraft[]>(() => startingLinks(initialUrl));
  const [isSaving, setIsSaving] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [saved, setSaved] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  function placeLink(url: string) {
    let placed = false;
    setLinks((current) => {
      if (current.some((link) => cleanHttpUrl(link.url) === url)) return current;
      const empty = current.findIndex((link) => !link.url.trim());
      const draft = { url, retailer: detectRetailer(url) };
      if (empty >= 0) {
        placed = true;
        return current.map((link, position) => (position === empty ? draft : link));
      }
      if (current.length >= MAX_LINKS) return current;
      placed = true;
      return [...current, draft];
    });
    setFeedback(placed ? { tone: 'ok', text: 'Link added.' } : null);
  }

  function handlePaste(event: ClipboardEvent<HTMLFormElement>) {
    // A link box takes the paste as usual.
    if (isLinkInput(event.target)) return;
    const pasted = event.clipboardData.getData('text/plain').trim();
    const url = cleanHttpUrl(pasted);
    // Only a bare link moves to the shop links; other text pastes as usual.
    if (!url || /\s/.test(pasted)) return;
    event.preventDefault();
    placeLink(url);
  }

  function handleDragOver(event: DragEvent<HTMLFormElement>) {
    const types = [...event.dataTransfer.types];
    if (!types.includes('text/uri-list') && !types.includes('text/plain')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (!isDropTarget) setIsDropTarget(true);
  }

  function handleDragLeave(event: DragEvent<HTMLFormElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDropTarget(false);
  }

  function handleDrop(event: DragEvent<HTMLFormElement>) {
    setIsDropTarget(false);
    const url = linkFromTransfer(event.dataTransfer);
    if (!url) return;
    event.preventDefault();
    placeLink(url);
  }

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

  function addLinkRow() {
    setLinks((current) => {
      if (current.length >= MAX_LINKS) {
        return current;
      }
      return [...current, { url: '', retailer: '' }];
    });
  }

  function removeLinkRow(index: number) {
    setLinks((current) => {
      if (current.length <= 1) {
        return current;
      }
      return current.filter((_, position) => position !== index);
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;
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
      setSaved(true);
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

  const canAddMore = links.length < MAX_LINKS;

  return (
    <form
      className={`card add-product-form${isDropTarget ? ' is-drop-target' : ''}`}
      onSubmit={handleSubmit}
      onPaste={handlePaste}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
          onChange={(event) => {
            setName(event.target.value);
            setSaved(false);
          }}
        />
      </div>

      <div className="field">
        <label htmlFor="target-price">Goal price (optional)</label>
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

      <div className="link-section-head">
        <p className="section-title link-section-title" style={{ margin: 0 }}>
          <Link2 size={15} aria-hidden="true" />
          Shop links
          <InfoTip label="Adding a link">Paste or drop a shop link anywhere on this form.</InfoTip>
        </p>
        <span className="hint">
          {links.length} / {MAX_LINKS}
        </span>
      </div>

      {links.map((link, index) => {
        const detectedShop = supportedShopForUrl(link.url);
        return (
          <div className="link-row" key={index}>
            <div className={`link-url-field${detectedShop ? ' has-shop-logo' : ''}`}>
              {detectedShop ? (
                <span className="link-url-logo" aria-hidden="true" title={detectedShop.name}>
                  <RetailerLogo
                    key={detectedShop.domain}
                    retailer={detectedShop.name}
                    url={link.url}
                  />
                </span>
              ) : null}
              <input
                type="url"
                inputMode="url"
                aria-label={`Shop link ${index + 1}`}
                placeholder="https://www.toymate.com.au/..."
                value={link.url}
                onChange={(event) => updateLink(index, { url: event.target.value })}
              />
            </div>
            <input
              type="text"
              aria-label={`Shop name ${index + 1}`}
              placeholder="Shop"
              value={link.retailer}
              onChange={(event) => updateLink(index, { retailer: event.target.value })}
            />
            {links.length > 1 ? (
              <button
                type="button"
                className="button danger link-remove"
                onClick={() => removeLinkRow(index)}
                aria-label={`Remove link row ${index + 1}`}
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        );
      })}

      <div className="form-actions">
        <button
          type="button"
          className="button"
          onClick={addLinkRow}
          disabled={!canAddMore}
        >
          <Plus size={16} aria-hidden="true" />
          Add another shop link
        </button>
        <button type="submit" className="button primary" disabled={isSaving || readOnly}>
          {isSaving ? (
            <LoaderCircle className="spin" size={16} aria-hidden="true" />
          ) : (
            <Save size={16} aria-hidden="true" />
          )}
          {isSaving ? 'Saving...' : 'Save product'}
        </button>
      </div>

      {!canAddMore ? (
        <p className="hint" style={{ marginTop: 8 }}>
          Limit reached. Save, then add more later.
        </p>
      ) : null}

      {feedback ? (
        <p
          className={`hint ${feedback.tone === 'error' ? 'error' : 'ok'}`}
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          style={{ marginTop: 10 }}
        >
          {feedback.text}
          {saved && savedHref ? (
            <>
              {' '}
              <Link href={savedHref}>See your list</Link>
            </>
          ) : null}
        </p>
      ) : null}

      {readOnly ? (
        <p className="hint" style={{ marginTop: 8 }}>
          This is the sample list, so saving is off. <Link href="/register">Make my own list</Link>
        </p>
      ) : null}
    </form>
  );
}
