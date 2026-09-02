export type RetailerEntry = {
  match: RegExp;
  name: string;
  /** Hostname used for favicon lookup (no www). */
  domain: string;
};

const RETAILERS: RetailerEntry[] = [
  { match: /(^|\.)kmart\.com\.au$/, name: 'Kmart', domain: 'kmart.com.au' },
  { match: /(^|\.)target\.com\.au$/, name: 'Target', domain: 'target.com.au' },
  { match: /(^|\.)bigw\.com\.au$/, name: 'Big W', domain: 'bigw.com.au' },
  { match: /(^|\.)coles\.com\.au$/, name: 'Coles', domain: 'coles.com.au' },
  { match: /(^|\.)woolworths\.com\.au$/, name: 'Woolworths', domain: 'woolworths.com.au' },
  { match: /(^|\.)therejectshop\.com\.au$/, name: 'The Reject Shop', domain: 'therejectshop.com.au' },
  { match: /(^|\.)rejectshop\.com\.au$/, name: 'The Reject Shop', domain: 'therejectshop.com.au' },
  { match: /(^|\.)amazon\.com\.au$/, name: 'Amazon AU', domain: 'amazon.com.au' },
  { match: /(^|\.)ebay\.com\.au$/, name: 'eBay AU', domain: 'ebay.com.au' },
  { match: /(^|\.)myer\.com\.au$/, name: 'Myer', domain: 'myer.com.au' },
  { match: /(^|\.)davidjones\.com$/, name: 'David Jones', domain: 'davidjones.com' },
  { match: /(^|\.)catch\.com\.au$/, name: 'Catch', domain: 'catch.com.au' },
  { match: /(^|\.)toysrus\.com\.au$/, name: 'Toys R Us', domain: 'toysrus.com.au' },
  { match: /(^|\.)toymate\.com\.au$/, name: 'Toymate', domain: 'toymate.com.au' },
  { match: /(^|\.)toyworld\.com\.au$/, name: 'Toyworld', domain: 'toyworld.com.au' },
  { match: /(^|\.)toyworld\.co\.nz$/, name: 'Toyworld', domain: 'toyworld.com.au' },
  { match: /(^|\.)bunnings\.com\.au$/, name: 'Bunnings', domain: 'bunnings.com.au' },
  { match: /(^|\.)bestandless\.com\.au$/, name: 'Best & Less', domain: 'bestandless.com.au' },
  { match: /(^|\.)chemistwarehouse\.com\.au$/, name: 'Chemist Warehouse', domain: 'chemistwarehouse.com.au' },
  { match: /(^|\.)priceline\.com\.au$/, name: 'Priceline', domain: 'priceline.com.au' },
  { match: /(^|\.)terrywhitechemmart\.com\.au$/, name: 'Terry White', domain: 'terrywhitechemmart.com.au' },
  { match: /(^|\.)repco\.com\.au$/, name: 'Repco', domain: 'repco.com.au' },
  { match: /(^|\.)supercheapauto\.com\.au$/, name: 'Supercheap Auto', domain: 'supercheapauto.com.au' }
];

/** Local files in /public/retailers, used when the live favicon is missing or tiny. */
const LOCAL_LOGOS: Record<string, string> = {
  'therejectshop.com.au': '/retailers/reject-shop.png',
  'rejectshop.com.au': '/retailers/reject-shop.png',
  'the reject shop': '/retailers/reject-shop.png',
  'reject shop': '/retailers/reject-shop.png'
};

function normalisedName(value: string): string {
  return value.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '');
}

function findRetailer(hostname: string): RetailerEntry | null {
  const host = hostname.replace(/^www\./, '');
  for (const entry of RETAILERS) {
    if (entry.match.test(host) || entry.match.test(hostname)) {
      return entry;
    }
  }
  return null;
}

// Guess a friendly shop name from a URL so nobody has to type it in by hand.
export function detectRetailer(rawUrl: string): string {
  let hostname: string;
  try {
    hostname = new URL(rawUrl.trim()).hostname.toLowerCase();
  } catch {
    return '';
  }

  const known = findRetailer(hostname);
  if (known) {
    return known.name;
  }

  const bare = hostname.replace(/^www\./, '').split('.')[0];
  return bare ? bare.charAt(0).toUpperCase() + bare.slice(1) : '';
}

function resolveDomain(retailerOrUrl: string): string | null {
  const raw = retailerOrUrl.trim();
  if (!raw) {
    return null;
  }

  let domain: string | null = null;

  try {
    if (/^https?:\/\//i.test(raw)) {
      domain = new URL(raw).hostname.replace(/^www\./, '');
    }
  } catch {
    domain = null;
  }

  if (!domain) {
    const byName = RETAILERS.find(
      (entry) => normalisedName(entry.name) === normalisedName(raw)
    );
    return byName?.domain ?? null;
  }

  return findRetailer(domain)?.domain ?? domain;
}

export function isKnownRetailer(retailerOrUrl: string): boolean {
  return hasCrawlerSupport(retailerOrUrl);
}

/** True when this shop has a dedicated crawler path, not merely a logo. */
export function hasCrawlerSupport(retailerOrUrl: string): boolean {
  const raw = retailerOrUrl.trim();
  if (!raw) {
    return false;
  }

  try {
    if (/^https?:\/\//i.test(raw)) {
      const hostname = new URL(raw).hostname.toLowerCase();
      if (findRetailer(hostname)) {
        return true;
      }
    }
  } catch {
    // Fall through to a name match.
  }

  const needle = normalisedName(raw);
  return RETAILERS.some((entry) => normalisedName(entry.name) === needle);
}

export type RetailerLogoSource = {
  src: string;
  local: boolean;
};

/** Local file when we have one, otherwise the shop favicon. */
export function retailerLogoSource(retailerOrUrl: string): RetailerLogoSource | null {
  const raw = retailerOrUrl.trim();
  const localByName = LOCAL_LOGOS[raw.toLowerCase()];
  if (localByName) {
    return { src: localByName, local: true };
  }

  const localByAlias = Object.entries(LOCAL_LOGOS).find(
    ([key]) => normalisedName(key) === normalisedName(raw)
  );
  if (localByAlias) {
    return { src: localByAlias[1], local: true };
  }

  const domain = resolveDomain(raw);
  if (!domain) {
    return null;
  }

  const localByDomain = LOCAL_LOGOS[domain];
  if (localByDomain) {
    return { src: localByDomain, local: true };
  }

  return {
    src: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`,
    local: false
  };
}

/** Favicon URL for a shop name or product URL. Falls back to a letter chip. */
export function retailerLogoUrl(retailerOrUrl: string): string | null {
  return retailerLogoSource(retailerOrUrl)?.src ?? null;
}

export function isValidHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
