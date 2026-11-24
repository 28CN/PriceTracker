'use client';

import InfoTip from './InfoTip';
import { Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import type { CategoryView } from '@/lib/types';

export default function CategoryPrivacyControls({
  categories
}: {
  categories: CategoryView[];
}) {
  const router = useRouter();
  const baseId = useId();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (categories.length === 0) return null;

  async function update(category: CategoryView, isPublic: boolean) {
    setPending(category.id);
    setError(null);
    const response = await fetch(`/api/categories/${category.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublic })
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    setPending(null);
    if (!response.ok) {
      setError(result?.error || 'Could not update category privacy.');
      return;
    }
    router.refresh();
  }

  return (
    <div className="category-privacy-compact">
      <InfoTip label="About hidden categories">
        On a public list, categories show unless you hide them. Products without a category always show.
      </InfoTip>
      <div className="category-privacy-list">
        {categories.map((category) => {
          const labelId = `${baseId}-${category.id}`;
          return (
            <div key={category.id} className="category-privacy-row">
              <span id={labelId}>
                {category.isPublic ? (
                  <Eye size={15} aria-hidden="true" />
                ) : (
                  <EyeOff size={15} aria-hidden="true" />
                )}
                {category.name}
              </span>
              <button
                type="button"
                role="switch"
                className={`toggle-switch${category.isPublic ? ' is-on' : ''}`}
                aria-labelledby={labelId}
                aria-checked={category.isPublic}
                disabled={pending === category.id}
                onClick={() => update(category, !category.isPublic)}
              >
                <span className="toggle-knob" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
      {error ? <div className="form-error" role="alert">{error}</div> : null}
    </div>
  );
}
