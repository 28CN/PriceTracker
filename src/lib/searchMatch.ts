/**
 * Pure search normalisation, matching and ranking helpers.
 * Runs both client-side (instant filter of a user's own watchlist)
 * and server-side (fuzzy matching over shared product_search_cache rows).
 */

export type SearchCandidate = {
  name: string;
  shops?: string[];
};

export type MatchKind = 'exact' | 'prefix' | 'fuzzy';

export type SearchMatchResult = {
  score: number;
  kind: MatchKind;
  matchedIn: 'name' | 'shop' | 'both';
};

export type PreparedField = {
  norm: string;
  tokens: string[];
  foldedTokens: string[];
  compact: string;
  foldedCompact: string;
  spans: string[];
};

export type PreparedCandidate = {
  name: PreparedField;
  shops: PreparedField[];
};

export type PreparedQuery = {
  raw: string;
  norm: string;
  tokens: string[];
  foldedTokens: string[];
  compact: string;
  foldedCompact: string;
};

const MAX_QUERY_TOKENS = 12;

/** Lowercase, strip accents and punctuation, collapse spaces. */
export function normalizeSearchText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Space-free normalised form so "hot wheels" == "hotwheels" == "Hot-Wheels". */
export function compactSearchText(raw: string): string {
  return normalizeSearchText(raw).replace(/\s+/g, '');
}

/** Simple English plural/singular folding ("cars"->"car", "boxes"->"box", "batteries"->"battery"). */
export function foldSingular(word: string): string {
  if (word.length <= 3 || !/^[a-z]+$/.test(word)) {
    return word;
  }
  if (word.length >= 5 && word.endsWith('ies')) {
    return `${word.slice(0, -3)}y`;
  }
  if (/(?:ch|sh|x|z|ss)es$/.test(word)) {
    return word.slice(0, -2);
  }
  if (word.endsWith('s') && !/(?:ss|us|is)$/.test(word)) {
    return word.slice(0, -1);
  }
  return word;
}

/** Allowed Damerau-Levenshtein edit distance for a query token of given length. */
export function fuzzyLimitFor(tokenLength: number): number {
  if (tokenLength >= 8) return 2;
  if (tokenLength >= 4) return 1;
  return 0;
}

/**
 * Restricted Damerau-Levenshtein (Optimal String Alignment) distance with
 * early exit when distance exceeds `maxDist`.
 */
export function damerauLevenshtein(a: string, b: string, maxDist = Infinity): number {
  if (a === b) return 0;
  const alen = a.length;
  const blen = b.length;
  if (Math.abs(alen - blen) > maxDist) return maxDist + 1;
  if (alen === 0) return blen;
  if (blen === 0) return alen;

  let prev2 = new Array<number>(blen + 1);
  let prev = new Array<number>(blen + 1);
  let curr = new Array<number>(blen + 1);

  for (let j = 0; j <= blen; j += 1) {
    prev[j] = j;
  }

  for (let i = 1; i <= alen; i += 1) {
    curr[0] = i;
    let rowMin = i;
    const ai = a.charCodeAt(i - 1);

    for (let j = 1; j <= blen; j += 1) {
      const bj = b.charCodeAt(j - 1);
      const cost = ai === bj ? 0 : 1;

      let best = prev[j] + 1; // deletion
      const ins = curr[j - 1] + 1; // insertion
      if (ins < best) best = ins;
      const sub = prev[j - 1] + cost; // substitution
      if (sub < best) best = sub;

      if (
        i > 1 &&
        j > 1 &&
        ai === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === bj
      ) {
        const trans = prev2[j - 2] + 1;
        if (trans < best) best = trans;
      }

      curr[j] = best;
      if (best < rowMin) rowMin = best;
    }

    if (rowMin > maxDist) {
      return maxDist + 1;
    }

    const tmp = prev2;
    prev2 = prev;
    prev = curr;
    curr = tmp;
  }

  return prev[blen];
}

export function prepareField(raw: string): PreparedField {
  const norm = normalizeSearchText(raw);
  const tokens = norm ? norm.split(' ') : [];
  const foldedTokens = tokens.map(foldSingular);
  const compact = tokens.join('');
  const foldedCompact = foldedTokens.join('');

  const spanSet = new Set<string>();
  for (let i = 0; i < foldedTokens.length; i += 1) {
    spanSet.add(foldedTokens[i]);
    if (tokens[i] !== foldedTokens[i]) {
      spanSet.add(tokens[i]);
    }
    const maxEnd = Math.min(foldedTokens.length, i + 3);
    for (let end = i + 2; end <= maxEnd; end += 1) {
      const foldedJoin = foldedTokens.slice(i, end).join('');
      spanSet.add(foldedJoin);
      const rawJoin = foldSingular(tokens.slice(i, end).join(''));
      spanSet.add(rawJoin);
    }
  }
  if (foldedCompact) {
    spanSet.add(foldedCompact);
  }
  if (compact && compact !== foldedCompact) {
    spanSet.add(compact);
  }

  return {
    norm,
    tokens,
    foldedTokens,
    compact,
    foldedCompact,
    spans: [...spanSet]
  };
}

export function prepareCandidate(candidate: SearchCandidate): PreparedCandidate {
  return {
    name: prepareField(candidate.name),
    shops: (candidate.shops ?? []).filter(Boolean).map(prepareField)
  };
}

export function prepareQuery(raw: string): PreparedQuery | null {
  const norm = normalizeSearchText(raw);
  if (!norm) return null;
  const tokens = norm.split(' ').slice(0, MAX_QUERY_TOKENS);
  const foldedTokens = tokens.map(foldSingular);
  return {
    raw,
    norm,
    tokens,
    foldedTokens,
    compact: tokens.join(''),
    foldedCompact: foldedTokens.join('')
  };
}

type ChunkHit = {
  score: number;
  kind: MatchKind;
};

function scoreChunkAgainstField(
  chunk: string,
  field: PreparedField,
  isName: boolean
): ChunkHit | null {
  if (!chunk || !field.norm) return null;

  // 1. Exact token / span / compact match.
  if (field.foldedCompact === chunk || field.compact === chunk) {
    return { score: isName ? 100 : 65, kind: 'exact' };
  }
  for (const span of field.spans) {
    if (span === chunk) {
      return { score: isName ? 100 : 65, kind: 'exact' };
    }
  }

  // 2. Prefix match on any word/span or the compact string.
  let bestPrefixLen = Infinity;
  for (const span of field.spans) {
    if (span.startsWith(chunk) && span.length < bestPrefixLen) {
      bestPrefixLen = span.length;
    }
  }
  if (field.foldedCompact.startsWith(chunk) && field.foldedCompact.length < bestPrefixLen) {
    bestPrefixLen = field.foldedCompact.length;
  }
  if (bestPrefixLen < Infinity) {
    const base = isName ? 70 : 45;
    const tightness = Math.min(8, Math.round((8 * chunk.length) / bestPrefixLen));
    return { score: base + tightness, kind: 'prefix' };
  }

  // Mid-word compact match only for longer chunks (>= 5 chars) so "wheels" matches "HotWheels"
  // without causing short-token false positives.
  if (chunk.length >= 5 && (field.foldedCompact.includes(chunk) || field.compact.includes(chunk))) {
    return { score: isName ? 55 : 32, kind: 'prefix' };
  }

  // 3. Light fuzzy tolerance (Damerau-Levenshtein <= 1 for >= 4 chars, <= 2 for >= 8 chars).
  const maxDist = fuzzyLimitFor(chunk.length);
  if (maxDist === 0) return null;

  let bestDist = maxDist + 1;
  for (const span of field.spans) {
    if (Math.abs(span.length - chunk.length) > maxDist) continue;
    const dist = damerauLevenshtein(chunk, span, bestDist - 1);
    if (dist < bestDist) {
      bestDist = dist;
      if (bestDist === 1) break;
    }
  }

  if (bestDist > maxDist) {
    return null;
  }
  if (bestDist === 1) {
    return { score: isName ? 35 : 20, kind: 'fuzzy' };
  }
  if (bestDist === 2) {
    return { score: isName ? 18 : 10, kind: 'fuzzy' };
  }

  return null;
}

const KIND_RANK: Record<MatchKind, number> = { exact: 2, prefix: 1, fuzzy: 0 };

function worseKind(a: MatchKind, b: MatchKind): MatchKind {
  return KIND_RANK[a] <= KIND_RANK[b] ? a : b;
}

type DpState = {
  totalScore: number;
  kind: MatchKind;
  usedName: boolean;
  usedShop: boolean;
};

export function matchPreparedCandidate(
  query: PreparedQuery,
  candidate: PreparedCandidate
): SearchMatchResult | null {
  const m = query.foldedTokens.length;
  if (m === 0) return null;

  const dp: (DpState | null)[] = new Array(m + 1).fill(null);
  dp[0] = { totalScore: 0, kind: 'exact', usedName: false, usedShop: false };

  for (let i = 0; i < m; i += 1) {
    const state = dp[i];
    if (!state) continue;

    const maxK = Math.min(3, m - i);
    for (let k = 1; k <= maxK; k += 1) {
      const chunk =
        k === 1
          ? query.foldedTokens[i]
          : query.foldedTokens.slice(i, i + k).join('');

      // Prevent merging tiny space-separated tokens like "a b" into "ab" unless exact full compact.
      if (k > 1 && chunk.length < 4 && chunk !== candidate.name.foldedCompact) {
        continue;
      }

      const nameHit = scoreChunkAgainstField(chunk, candidate.name, true);
      let shopHit: ChunkHit | null = null;
      for (const shopField of candidate.shops) {
        const hit = scoreChunkAgainstField(chunk, shopField, false);
        if (hit && (!shopHit || hit.score > shopHit.score)) {
          shopHit = hit;
        }
      }

      let picked: (ChunkHit & { source: 'name' | 'shop' }) | null = null;
      if (nameHit && (!shopHit || nameHit.score >= shopHit.score)) {
        picked = { ...nameHit, source: 'name' };
      } else if (shopHit) {
        picked = { ...shopHit, source: 'shop' };
      }

      if (!picked) continue;

      const nextScore = state.totalScore + picked.score * k;
      const nextKind = worseKind(state.kind, picked.kind);
      const prevBest = dp[i + k];

      if (!prevBest || nextScore > prevBest.totalScore) {
        dp[i + k] = {
          totalScore: nextScore,
          kind: nextKind,
          usedName: state.usedName || picked.source === 'name',
          usedShop: state.usedShop || picked.source === 'shop'
        };
      }
    }
  }

  const finalState = dp[m];
  if (!finalState) return null;

  let score = finalState.totalScore / m;

  // Whole-field ranking bonuses: exact full name > name starts with query > name-only match.
  if (
    candidate.name.foldedCompact === query.foldedCompact ||
    candidate.name.compact === query.compact ||
    candidate.name.norm === query.norm
  ) {
    score += 50;
  } else if (
    candidate.name.foldedCompact.startsWith(query.foldedCompact) ||
    candidate.name.norm.startsWith(query.norm)
  ) {
    score += 20;
  }

  if (finalState.usedName && !finalState.usedShop) {
    score += 10;
  }

  const matchedIn: SearchMatchResult['matchedIn'] =
    finalState.usedName && finalState.usedShop
      ? 'both'
      : finalState.usedName
        ? 'name'
        : 'shop';

  return {
    score: Math.round(score * 10) / 10,
    kind: finalState.kind,
    matchedIn
  };
}

export function matchSearchCandidate(
  query: string,
  candidate: SearchCandidate
): SearchMatchResult | null {
  const preparedQuery = prepareQuery(query);
  if (!preparedQuery) return null;
  return matchPreparedCandidate(preparedQuery, prepareCandidate(candidate));
}

export function rankPreparedItems<T>(
  query: string,
  entries: readonly { item: T; prepared: PreparedCandidate }[],
  limit?: number
): { item: T; match: SearchMatchResult }[] {
  const preparedQuery = prepareQuery(query);
  if (!preparedQuery) return [];

  const matched: { item: T; match: SearchMatchResult }[] = [];
  for (const entry of entries) {
    const match = matchPreparedCandidate(preparedQuery, entry.prepared);
    if (match) {
      matched.push({ item: entry.item, match });
    }
  }

  matched.sort((a, b) => b.match.score - a.match.score);
  return typeof limit === 'number' ? matched.slice(0, limit) : matched;
}

export function rankSearchItems<T>(
  query: string,
  items: readonly T[],
  getCandidate: (item: T) => SearchCandidate,
  limit?: number
): { item: T; match: SearchMatchResult }[] {
  const preparedQuery = prepareQuery(query);
  if (!preparedQuery) return [];

  const matched: { item: T; match: SearchMatchResult }[] = [];
  for (const item of items) {
    const match = matchPreparedCandidate(preparedQuery, prepareCandidate(getCandidate(item)));
    if (match) {
      matched.push({ item, match });
    }
  }

  matched.sort((a, b) => b.match.score - a.match.score);
  return typeof limit === 'number' ? matched.slice(0, limit) : matched;
}

function numericTokens(tokens: string[]): string[] {
  return tokens.filter((t) => /\d/.test(t)).sort();
}

/**
 * True when two product titles refer to the same product despite minor
 * formatting, punctuation, spacing, or pluralisation differences.
 * Numeric tokens (pack counts, sizes, model numbers) must agree.
 */
export function isNearIdenticalName(a: string, b: string): boolean {
  const fa = prepareField(a);
  const fb = prepareField(b);
  if (!fa.foldedCompact || !fb.foldedCompact) return false;

  const numsA = numericTokens(fa.tokens);
  const numsB = numericTokens(fb.tokens);
  if (numsA.length !== numsB.length || numsA.some((v, idx) => v !== numsB[idx])) {
    return false;
  }

  if (fa.foldedCompact === fb.foldedCompact) {
    return true;
  }

  const minCompactLen = Math.min(fa.foldedCompact.length, fb.foldedCompact.length);
  if (minCompactLen >= 8 && damerauLevenshtein(fa.foldedCompact, fb.foldedCompact, 2) <= 2) {
    return true;
  }

  const setA = new Set(fa.foldedTokens);
  const setB = new Set(fb.foldedTokens);
  if (setA.size >= 3 && setB.size >= 3) {
    let intersection = 0;
    for (const token of setA) {
      if (setB.has(token)) intersection += 1;
    }
    const union = setA.size + setB.size - intersection;
    if (union > 0 && intersection / union >= 0.8) {
      return true;
    }
  }

  return false;
}

/** Prepend a search term to the recent list, deduplicating case/punctuation-insensitively. */
export function addRecentSearch(existing: readonly string[], query: string, limit = 5): string[] {
  const trimmed = query.trim();
  const key = compactSearchText(trimmed);
  if (!key) return [...existing].slice(0, limit);
  const filtered = existing.filter((entry) => compactSearchText(entry) !== key);
  return [trimmed, ...filtered].slice(0, limit);
}
