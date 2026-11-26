import { normalizeSearchText } from '@/lib/searchMatch';

/**
 * Brands and franchises a deal can match on its own, so tracking two Hot
 * Wheels cars brings in any Hot Wheels deal. `also` lists names that only
 * point at the brand on the tracked side (Bingo is a Bluey character); deal
 * titles must name the brand itself. Shop house brands are left out.
 */
const BRANDS: readonly { label: string; also?: readonly string[] }[] = [
  // Toys and kids
  { label: 'Hot Wheels' },
  { label: 'Matchbox' },
  { label: 'LEGO' },
  { label: 'Bluey', also: ['Bingo'] },
  { label: 'B.Box' },
  { label: 'Barbie' },
  { label: 'Paw Patrol' },
  { label: 'Pokemon' },
  { label: 'Peppa Pig' },
  { label: 'Nerf' },
  { label: 'Play-Doh' },
  { label: 'Fisher-Price' },
  { label: 'Squishmallows' },
  { label: 'Hatchimals' },
  { label: 'Minecraft' },
  { label: 'Super Mario' },
  { label: 'Disney' },
  { label: 'Marvel' },
  { label: 'Star Wars' },
  { label: 'Funko' },
  { label: 'Tonka' },
  { label: 'VTech' },
  { label: 'Monster Jam' },
  { label: 'Transformers' },
  { label: 'Jellycat' },
  { label: 'Crayola' },
  { label: 'Huggies' },
  // Groceries and household
  { label: "Arnott's" },
  { label: 'Tim Tam' },
  { label: 'Vegemite' },
  { label: 'Sanitarium' },
  { label: 'Weet-Bix' },
  { label: 'Milo' },
  { label: 'Heinz' },
  { label: 'Cadbury' },
  { label: 'Lindt' },
  { label: 'Nescafe' },
  { label: 'Moccona' },
  { label: 'Coca-Cola' },
  { label: 'Dairy Farmers' },
  { label: 'Western Star' },
  { label: 'Bulla' },
  { label: 'Connoisseur' },
  { label: 'Kleenex' },
  { label: 'OMO' },
  { label: 'Morning Fresh' },
  { label: 'Dettol' },
  { label: 'Colgate' },
  { label: 'Energizer' },
  { label: 'Duracell' },
  // Car care and tools
  { label: 'Nulon' },
  { label: 'Penrite' },
  { label: 'Castrol' },
  { label: 'Meguiars' },
  { label: 'Ryobi' },
  { label: 'Ozito' },
  { label: 'Makita' },
  { label: 'DeWalt' }
];

/** First words that say nothing about the brand, plus shop and house brands. */
const GENERIC_LEADS = new Set(
  (
    'the a an new original classic mini super basic large small big organic fresh natural premium kids baby ' +
    'australian aussie free range pure ultra extra max pro plus value family assorted pack set single ' +
    'coles woolworths kmart anko target bigw big w aldi iga essentials macro select homebrand ' +
    'reject shop amazon ebay myer catch bunnings priceline chemist warehouse repco supercheap autobarn'
  ).split(' ')
);

export type DealBrand = { label: string; pattern: RegExp };

/** "Hot Wheels" matches "hot wheels" and "hotwheels" as whole words; "Arnott's" also matches "arnotts". */
function phrasePattern(phrase: string, loose = true): RegExp | null {
  const words = normalizeSearchText(phrase).split(' ').filter(Boolean);
  if (!words.length) return null;
  return new RegExp(`(?:^| )${words.join(loose ? ' ?' : ' ')}(?: |$)`);
}

/** Words from a shop link's path ("/product/hot-wheels-basic-car-5621682" → "product hot wheels basic car 5621682"). */
function urlWords(url: string): string {
  try {
    return normalizeSearchText(decodeURIComponent(new URL(url).pathname));
  } catch {
    return '';
  }
}

/**
 * Brands behind the tracked items, read from names, group names and shop link slugs. A
 * first word shared by two or more item names counts too (e.g. a brand not in
 * the list above), unless it is generic or a shop name.
 */
export function brandsForProducts(
  products: readonly { name: string; categoryName?: string | null; links?: readonly { url: string }[] }[]
): DealBrand[] {
  const found = new Map<string, DealBrand>();
  const texts = products.map((product) =>
    [
      normalizeSearchText(product.name),
      normalizeSearchText(product.categoryName ?? ''),
      ...(product.links ?? []).map((link) => urlWords(link.url))
    ].join(' | ')
  );

  for (const brand of BRANDS) {
    const pattern = phrasePattern(brand.label);
    if (!pattern) continue;
    const detect = [pattern, ...(brand.also ?? []).map(phrasePattern).filter((p): p is RegExp => p !== null)];
    if (texts.some((text) => text.split(' | ').some((part) => detect.some((p) => p.test(part))))) {
      found.set(brand.label.toLowerCase(), { label: brand.label, pattern });
    }
  }

  const leads = new Map<string, { label: string; count: number }>();
  for (const product of products) {
    const first = product.name.trim().split(/\s+/)[0] ?? '';
    const key = normalizeSearchText(first);
    if (key.length < 4 || /\d/.test(key) || key.split(' ').some((word) => GENERIC_LEADS.has(word))) continue;
    const entry = leads.get(key) ?? { label: first, count: 0 };
    entry.count += 1;
    leads.set(key, entry);
  }
  for (const [key, { label, count }] of leads) {
    if (count < 2) continue;
    // Exact words only: "Pic's" must not match "pics".
    const pattern = phrasePattern(key, false);
    const already = [...found.values()].some((brand) => brand.pattern.test(key));
    if (pattern && !already) found.set(key, { label, pattern });
  }

  return [...found.values()];
}

/** The brand on the list that a deal title names, if any (the earliest mention wins). */
export function brandInTitle(title: string, brands: readonly DealBrand[]): string | null {
  const text = normalizeSearchText(title);
  let best: { label: string; at: number } | null = null;
  for (const brand of brands) {
    const hit = brand.pattern.exec(text);
    if (hit && (!best || hit.index < best.at)) best = { label: brand.label, at: hit.index };
  }
  return best?.label ?? null;
}
