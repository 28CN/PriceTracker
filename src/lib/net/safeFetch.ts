import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * SSRF-safe fetch for remote images.
 * - only http/https, no credentials in URL
 * - resolves DNS first and rejects private / loopback / link-local / reserved
 *   IPv4 + IPv6 (incl. IPv4-mapped IPv6 and cloud metadata 169.254.169.254)
 * - follows redirects manually, re-validating every hop (capped)
 * - accepts only image/* responses and enforces a byte cap while streaming
 * - hard timeout across the whole request chain
 *
 * Note: Node's fetch re-resolves the host when connecting, so a DNS-rebinding
 * window still exists between our check and the connection. This blocks the
 * practical cases (stored internal URLs, redirects to internal hosts).
 */

export type SafeFetchErrorCode =
  | 'BAD_URL'
  | 'BAD_PROTOCOL'
  | 'BLOCKED_ADDRESS'
  | 'DNS_FAILED'
  | 'TOO_MANY_REDIRECTS'
  | 'BAD_STATUS'
  | 'BAD_CONTENT_TYPE'
  | 'TOO_LARGE'
  | 'TIMEOUT'
  | 'NETWORK';

export class SafeFetchError extends Error {
  readonly code: SafeFetchErrorCode;
  constructor(code: SafeFetchErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'SafeFetchError';
  }
}

export type LookupFn = (hostname: string) => Promise<{ address: string; family: number }[]>;

export interface SafeFetchOptions {
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Content-type prefix to accept. Default 'image/'. */
  acceptContentType?: string;
  /** Injectable for tests. */
  lookup?: LookupFn;
  fetchImpl?: typeof fetch;
}

export interface SafeFetchResult {
  body: Buffer;
  contentType: string;
  finalUrl: string;
  status: number;
}

const defaultLookup: LookupFn = (hostname) => dnsLookup(hostname, { all: true, verbatim: true });

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local + cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4] // reserved + broadcast
];

export function isBlockedIPv4(ip: string): boolean {
  if (isIP(ip) !== 4) return true;
  const n = ipv4ToInt(ip);
  return BLOCKED_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (ipv4ToInt(base) & mask);
  });
}

/** Expand an IPv6 address into 8 16-bit groups. Returns null if invalid. */
function expandIPv6(ip: string): number[] | null {
  let addr = ip.toLowerCase();
  const zone = addr.indexOf('%');
  if (zone !== -1) addr = addr.slice(0, zone);
  // Trailing embedded IPv4 (e.g. ::ffff:1.2.3.4)
  const lastColon = addr.lastIndexOf(':');
  const tail = addr.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (isIP(tail) !== 4) return null;
    const n = ipv4ToInt(tail);
    addr = `${addr.slice(0, lastColon + 1)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...Array(fill).fill('0'), ...rest];
  if (groups.length !== 8) return null;
  const out = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return out.some(Number.isNaN) ? null : out;
}

export function isBlockedIPv6(ip: string): boolean {
  const g = expandIPv6(ip);
  if (!g) return true;
  const embeddedV4 = (hi: number, lo: number) =>
    `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;

  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    return isBlockedIPv4(embeddedV4(g[6], g[7]));
  }
  // IPv4-translated ::ffff:0:a.b.c.d and NAT64 64:ff9b::/96
  if (g.slice(0, 4).every((x) => x === 0) && g[4] === 0xffff && g[5] === 0) {
    return isBlockedIPv4(embeddedV4(g[6], g[7]));
  }
  if (g[0] === 0x64 && g[1] === 0xff9b) return isBlockedIPv4(embeddedV4(g[6], g[7]));
  if (g[0] === 0x2002) return isBlockedIPv4(embeddedV4(g[1], g[2])); // 6to4
  const first = g[0];
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (first === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (first === 0x2001 && g[1] < 0x0200) return true; // 2001::/23 IETF special (Teredo, ORCHID…)
  if (first === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // discard-only
  return false;
}

export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isBlockedIPv4(ip);
  if (family === 6) return isBlockedIPv6(ip);
  return true;
}

/** Validate URL syntax/protocol and that every resolved address is public. */
export async function assertSafeUrl(raw: string, lookup: LookupFn = defaultLookup): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError('BAD_URL', 'Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SafeFetchError('BAD_PROTOCOL', `Protocol ${url.protocol} not allowed`);
  }
  if (url.username || url.password) {
    throw new SafeFetchError('BAD_URL', 'Credentials in URL not allowed');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) throw new SafeFetchError('BAD_URL', 'Missing host');

  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new SafeFetchError('BLOCKED_ADDRESS', 'Address not allowed');
    return url;
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new SafeFetchError('BLOCKED_ADDRESS', 'Host not allowed');
  }

  let records: { address: string; family: number }[];
  try {
    records = await lookup(host);
  } catch {
    throw new SafeFetchError('DNS_FAILED', 'DNS lookup failed');
  }
  if (!records.length) throw new SafeFetchError('DNS_FAILED', 'No DNS records');
  if (records.some((r) => isBlockedAddress(r.address))) {
    throw new SafeFetchError('BLOCKED_ADDRESS', 'Resolved address not allowed');
  }
  return url;
}

async function readCapped(res: Response, maxBytes: number): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new SafeFetchError('TOO_LARGE', 'Response exceeds size limit');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const {
    maxBytes = 8 * 1024 * 1024,
    maxRedirects = 3,
    timeoutMs = 8_000,
    headers = {},
    acceptContentType = 'image/',
    lookup = defaultLookup,
    fetchImpl = fetch
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = rawUrl;
    for (let hop = 0; ; hop++) {
      const url = await assertSafeUrl(current, lookup);
      let res: Response;
      try {
        res = await fetchImpl(url.toString(), {
          headers,
          redirect: 'manual',
          cache: 'no-store',
          signal: controller.signal
        });
      } catch {
        if (controller.signal.aborted) throw new SafeFetchError('TIMEOUT', 'Request timed out');
        throw new SafeFetchError('NETWORK', 'Network error');
      }

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        await res.body?.cancel().catch(() => {});
        if (!location) throw new SafeFetchError('BAD_STATUS', 'Redirect without Location');
        if (hop >= maxRedirects) throw new SafeFetchError('TOO_MANY_REDIRECTS', 'Too many redirects');
        current = new URL(location, url).toString();
        continue;
      }

      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        throw new SafeFetchError('BAD_STATUS', `Upstream status ${res.status}`);
      }
      const contentType = (res.headers.get('content-type') || '').toLowerCase().trim();
      if (!contentType.startsWith(acceptContentType)) {
        await res.body?.cancel().catch(() => {});
        throw new SafeFetchError('BAD_CONTENT_TYPE', `Content-Type ${contentType || '(none)'} not allowed`);
      }
      const declared = Number(res.headers.get('content-length') || 0);
      if (declared > maxBytes) {
        await res.body?.cancel().catch(() => {});
        throw new SafeFetchError('TOO_LARGE', 'Declared size exceeds limit');
      }
      let body: Buffer;
      try {
        body = await readCapped(res, maxBytes);
      } catch (err) {
        if (err instanceof SafeFetchError) throw err;
        if (controller.signal.aborted) throw new SafeFetchError('TIMEOUT', 'Request timed out');
        throw new SafeFetchError('NETWORK', 'Body read failed');
      }
      return { body, contentType, finalUrl: url.toString(), status: res.status };
    }
  } finally {
    clearTimeout(timer);
  }
}
