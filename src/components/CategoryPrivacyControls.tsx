'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { CategoryView } from '@/lib/types';

export default function CategoryPrivacyControls({
  categories
}: {
  categories: CategoryView[];
}) {
  const router = useRouter();
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
      <p className="hint">
        When your watchlist is public, categories are shown unless you hide them.
        Products without a category stay visible.
      </p>
      <div className="category-privacy-list">
        {categories.map((category) => (
          <label key={category.id} className="category-privacy-row">
            <span>
              {category.isPublic ? <Eye size={15} /> : <EyeOff size={15} />}
              {category.name}
            </span>
            <button
              type="button"
              role="switch"
              className={`toggle-switch${category.isPublic ? ' is-on' : ''}`}
              aria-checked={category.isPublic}
              disabled={pending === category.id}
              onClick={() => update(category, !category.isPublic)}
            >
              <span className="toggle-knob" />
              <span className="sr-only">
                {category.isPublic ? 'Shown on public profile' : 'Hidden on public profile'}
              </span>
            </button>
          </label>
        ))}
      </div>
      {error ? <div className="form-error">{error}</div> : null}
    </div>
  );
}
