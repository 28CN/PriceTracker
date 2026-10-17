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
    <section className="category-privacy card">
      <div>
        <span className="eyebrow">Public profile</span>
        <h2>Category visibility</h2>
        <p>
          When your watchlist is public, categories are shown unless you hide them.
          Products without a category stay visible.
        </p>
      </div>
      <div className="category-privacy-list">
        {categories.map((category) => (
          <label key={category.id}>
            <span>
              {category.isPublic ? <Eye size={15} /> : <EyeOff size={15} />}
              {category.name}
            </span>
            <select
              value={category.isPublic ? 'public' : 'private'}
              disabled={pending === category.id}
              onChange={(event) => update(category, event.target.value === 'public')}
            >
              <option value="public">Shown</option>
              <option value="private">Hidden</option>
            </select>
          </label>
        ))}
      </div>
      {error ? <div className="form-error">{error}</div> : null}
    </section>
  );
}
