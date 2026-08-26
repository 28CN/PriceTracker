export const LIST_KINDS = ['daily', 'daigou'] as const;

export type ListKind = (typeof LIST_KINDS)[number];

export const LIST_LABELS: Record<ListKind, string> = {
  daily: '日常购物',
  daigou: '代购'
};

export const LIST_BLURBS: Record<ListKind, string> = {
  daily: 'Groceries, hardware, pharmacy — the weekly shop.',
  daigou: 'Restock list for the toys and specialty finds.'
};

export const LAST_LIST_STORAGE_KEY = 'pricetracker.betaList';

export function isListKind(value: string | null | undefined): value is ListKind {
  return value === 'daily' || value === 'daigou';
}

export function parseListKind(value: string | null | undefined): ListKind | null {
  return isListKind(value) ? value : null;
}
