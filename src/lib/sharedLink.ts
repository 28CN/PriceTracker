import { cleanHttpUrl, firstUrlIn, looksLikeProductPage } from '@/lib/productUrl';

export type SharedLink =
  | { status: 'empty' }
  | { status: 'invalid' }
  | { status: 'listing'; url: string }
  | { status: 'ok'; url: string; name: string };

type SharedParams = { url?: string | string[]; text?: string | string[]; title?: string | string[] };

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value || '').slice(0, 2000).trim();
}

const SHOP_SUFFIX =
  /\s+[\u2013\u2014-]\s+(coles|woolworths|kmart(\s+australia)?|big\s*w|target(\s+australia)?|chemist\s+warehouse|toymate|jb\s+hi-fi|amazon\.com\.au)\s*$/i;

/** "Bluey Plush | Toymate" -> "Bluey Plush". Shops put their name at the end. */
export function cleanSharedTitle(raw: string): string {
  const title = raw.replace(/\s+/g, ' ').trim();
  const beforeBar = title.split(/\s+\|\s+/)[0] || '';
  const cut = beforeBar.replace(SHOP_SUFFIX, '');
  return cut.replace(/^buy\s+/i, '').slice(0, 120).trim();
}

/**
 * Reads /add?url=…&title=…&text=…. Android share sends the link in "text",
 * bookmarklets and iOS Shortcuts send "url".
 */
export function parseSharedLink(params: SharedParams): SharedLink {
  const rawUrl = one(params.url);
  const text = one(params.text);
  const title = one(params.title);
  if (!rawUrl && !text) return { status: 'empty' };

  const url = (rawUrl && cleanHttpUrl(rawUrl)) || firstUrlIn(text) || firstUrlIn(rawUrl);
  if (!url) return { status: 'invalid' };
  if (!looksLikeProductPage(url)) return { status: 'listing', url };

  const textWithoutLink = text.replace(/https?:\/\/\S+/gi, '').trim();
  return { status: 'ok', url, name: cleanSharedTitle(title || textWithoutLink) };
}

/** Keeps only the share params, so the login page can send the visitor back. */
export function addPathFor(params: SharedParams): string {
  const query = new URLSearchParams();
  for (const key of ['url', 'title', 'text'] as const) {
    const value = one(params[key]);
    if (value) query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `/add?${qs}` : '/add';
}
