/** This week's sale pages. Each was checked to open (HTTP 200) on 24 Nov 2026. */
export const SPECIALS_LINKS = [
  { shop: 'Coles', label: 'On special', href: 'https://www.coles.com.au/on-special' },
  { shop: 'Woolworths', label: 'Half price', href: 'https://www.woolworths.com.au/shop/browse/specials/half-price' },
  { shop: 'Kmart', label: 'Catalogue', href: 'https://www.kmart.com.au/catalogue/' },
  { shop: 'Big W', label: 'Deals', href: 'https://www.bigw.com.au/collection/deals' },
  { shop: 'Target', label: 'Deals', href: 'https://www.target.com.au/deals' },
  { shop: 'Chemist Warehouse', label: 'Catalogue', href: 'https://www.chemistwarehouse.com.au/catalogue' }
] as const;

/**
 * A bookmark that only opens {origin}/add with the page's link and title.
 * It reads nothing else from the page and sends nothing anywhere.
 */
export function bookmarkletFor(origin: string): string {
  const base = JSON.stringify(`${origin.replace(/\/$/, '')}/add?url=`);
  return `javascript:(()=>{location.href=${base}+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)})()`;
}
