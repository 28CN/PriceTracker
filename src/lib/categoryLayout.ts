import type { SupabaseClient } from '@supabase/supabase-js';

export const CATEGORY_LAYOUT_KEY = 'category_layout';

export type CategoryLayout = {
  pinned: string[];
  otherOrder: string[];
};

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function parseCategoryLayout(value: unknown): CategoryLayout | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  return { pinned: stringList(record.pinned), otherOrder: stringList(record.otherOrder) };
}

/** Null when the table is missing or nothing has been saved yet. */
export async function fetchCategoryLayout(supabase: SupabaseClient): Promise<CategoryLayout | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', CATEGORY_LAYOUT_KEY)
    .maybeSingle();

  if (error) {
    console.error('[categoryLayout] could not read app_settings:', error.message);
    return null;
  }
  return parseCategoryLayout(data?.value);
}
