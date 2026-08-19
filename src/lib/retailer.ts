const RETAILERS: Array<{ match: RegExp; name: string }> = [
  { match: /(^|\.)kmart\.com\.au$/, name: 'Kmart' },
  { match: /(^|\.)target\.com\.au$/, name: 'Target' },
  { match: /(^|\.)bigw\.com\.au$/, name: 'Big W' },
  { match: /(^|\.)coles\.com\.au$/, name: 'Coles' },
  { match: /(^|\.)woolworths\.com\.au$/, name: 'Woolworths' },
  { match: /(^|\.)therejectshop\.com\.au$/, name: 'The Reject Shop' },
  { match: /(^|\.)amazon\.com\.au$/, name: 'Amazon AU' },
  { match: /(^|\.)ebay\.com\.au$/, name: 'eBay AU' },
  { match: /(^|\.)myer\.com\.au$/, name: 'Myer' },
  { match: /(^|\.)davidjones\.com$/, name: 'David Jones' },
  { match: /(^|\.)catch\.com\.au$/, name: 'Catch' },
  { match: /(^|\.)toysrus\.com\.au$/, name: 'Toys R Us' }
];

// Guess a friendly shop name from a URL so nobody has to type it in by hand.
export function detectRetailer(rawUrl: string): string {
  let hostname: string;
  try {
    hostname = new URL(rawUrl.trim()).hostname.toLowerCase();
  } catch {
    return '';
  }

  for (const entry of RETAILERS) {
    if (entry.match.test(hostname)) {
      return entry.name;
    }
  }

  const bare = hostname.replace(/^www\./, '').split('.')[0];
  return bare ? bare.charAt(0).toUpperCase() + bare.slice(1) : '';
}

export function isValidHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
