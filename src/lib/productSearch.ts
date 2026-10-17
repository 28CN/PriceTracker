import { createHash } from 'node:crypto';

import { detectRetailer } from '@/lib/retailer';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { cleanHttpUrl, isTrackableSearchUrl } from '@/lib/productUrl';

export type ProductSearchHit = {
  name: string;
  imageUrl: string | null;
  retailer: string;
  url: string;
};

export type ProductSearchProvider = {
  search(query: string): Promise<ProductSearchHit[]>;
};

type CseItem = {
  title?: string;
  link?: string;
  pagemap?: {
    cse_image?: { src?: string }[];
    cse_thumbnail?: { src?: string }[];
    metatags?: Record<string, string>[];
  };
};

const DAILY_SEARCH_LIMIT = 30;

class GoogleProgrammableSearch implements ProductSearchProvider {
  constructor(
    private readonly apiKey: string,
    private readonly cx: string
  ) {}

  async search(query: string): Promise<ProductSearchHit[]> {
    const endpoint = new URL('https://www.googleapis.com/customsearch/v1');
    endpoint.searchParams.set('key', this.apiKey);
    endpoint.searchParams.set('cx', this.cx);
    endpoint.searchParams.set('q', query);
    endpoint.searchParams.set('num', '10');
    endpoint.searchParams.set('safe', 'active');

    const response = await fetch(endpoint, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Search provider responded ${response.status}.`);
    }
    const payload = (await response.json()) as { items?: CseItem[] };
    const seen = new Set<string>();
    const hits: ProductSearchHit[] = [];
    for (const item of payload.items || []) {
      const cleaned = item.link ? cleanHttpUrl(item.link) : null;
      if (!cleaned || !isTrackableSearchUrl(cleaned) || seen.has(cleaned)) continue;
      const retailer = detectRetailer(cleaned);
      if (!retailer) continue;
      const name = (item.pagemap?.metatags?.[0]?.['og:title'] || item.title || retailer)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180);
      if (!name) continue;
      seen.add(cleaned);
      hits.push({
        name,
        imageUrl: httpsImage(item),
        retailer,
        url: cleaned
      });
      if (hits.length >= 8) break;
    }
    return hits;
  }
}

function httpsImage(item: CseItem): string | null {
  const candidates = [
    item.pagemap?.cse_image?.[0]?.src,
    item.pagemap?.metatags?.[0]?.['og:image'],
    item.pagemap?.cse_thumbnail?.[0]?.src
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:') return url.toString();
    } catch {
      continue;
    }
  }
  return null;
}

export function createProductSearch(): ProductSearchProvider | null {
  const apiKey = process.env.GOOGLE_CSE_API_KEY?.trim();
  const cx = process.env.GOOGLE_CSE_ID?.trim();
  if (!apiKey || !cx) return null;
  return new GoogleProgrammableSearch(apiKey, cx);
}

export async function allowProductSearch(userId: string): Promise<boolean> {
  const pepper = process.env.AUTH_RATE_LIMIT_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const keyHash = createHash('sha256').update(`${pepper}:search:${userId}`).digest('hex');
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc('consume_auth_rate_limit', {
    candidate_key_hash: keyHash,
    candidate_action: 'search',
    attempt_limit: DAILY_SEARCH_LIMIT,
    window_seconds: 86400
  });
  if (error) {
    console.error('[search] rate limiter unavailable:', error.message);
    return false;
  }
  return data === true;
}
