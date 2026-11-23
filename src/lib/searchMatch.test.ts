import { describe, expect, it } from 'vitest';

import {
  addRecentSearch,
  compactSearchText,
  damerauLevenshtein,
  foldSingular,
  isNearIdenticalName,
  matchSearchCandidate,
  normalizeSearchText,
  rankSearchItems
} from './searchMatch';

describe('normalizeSearchText & compactSearchText', () => {
  it('lowercases, strips accents and punctuation, and collapses spaces', () => {
    expect(normalizeSearchText('  Crème  Brûlée!! — 10-Pack ')).toBe('creme brulee 10 pack');
    expect(normalizeSearchText('Café Hot-Wheels™')).toBe('cafe hot wheels');
  });

  it('produces identical compact form across spacing and punctuation variants', () => {
    expect(compactSearchText('hot wheels')).toBe('hotwheels');
    expect(compactSearchText('hotwheels')).toBe('hotwheels');
    expect(compactSearchText('Hot-Wheels')).toBe('hotwheels');
    expect(compactSearchText('Hot  Wheels!')).toBe('hotwheels');
  });
});

describe('foldSingular', () => {
  it('folds common English plurals to singular', () => {
    expect(foldSingular('cars')).toBe('car');
    expect(foldSingular('boxes')).toBe('box');
    expect(foldSingular('batteries')).toBe('battery');
    expect(foldSingular('watches')).toBe('watch');
    expect(foldSingular('brushes')).toBe('brush');
    expect(foldSingular('wheels')).toBe('wheel');
  });

  it('does not mangle short words or -ss/-us/-is words', () => {
    expect(foldSingular('bus')).toBe('bus');
    expect(foldSingular('gas')).toBe('gas');
    expect(foldSingular('as')).toBe('as');
    expect(foldSingular('glass')).toBe('glass');
    expect(foldSingular('focus')).toBe('focus');
    expect(foldSingular('tennis')).toBe('tennis');
    expect(foldSingular('pies')).toBe('pie');
  });
});

describe('damerauLevenshtein', () => {
  it('counts adjacent transpositions as 1 edit', () => {
    expect(damerauLevenshtein('kmrat', 'kmart')).toBe(1);
    expect(damerauLevenshtein('hotwheles', 'hotwheels')).toBe(1);
  });

  it('respects maxDist early exit', () => {
    expect(damerauLevenshtein('abcdef', 'zzzzzz', 2)).toBeGreaterThan(2);
    expect(damerauLevenshtein('battery', 'batery', 1)).toBe(1);
  });
});

describe('matchSearchCandidate', () => {
  it('matches "hot wheels", "hotwheels" and "Hot-Wheels" in both directions', () => {
    expect(matchSearchCandidate('hotwheels', { name: 'Hot Wheels 5-Pack' })).not.toBeNull();
    expect(matchSearchCandidate('Hot-Wheels', { name: 'HotWheels 5-Pack' })).not.toBeNull();
    expect(matchSearchCandidate('hot wheels', { name: 'HotWheels 5-Pack' })).not.toBeNull();
    expect(matchSearchCandidate('hot wheels', { name: 'Mattel HotWheels Car' })).not.toBeNull();
    expect(matchSearchCandidate('wheels', { name: 'HotWheels 5-Pack' })).not.toBeNull();
  });

  it('matches plural and singular forms interchangeably', () => {
    expect(matchSearchCandidate('cars', { name: 'Hot Wheels Car' })).not.toBeNull();
    expect(matchSearchCandidate('car', { name: 'Hot Wheels Cars' })).not.toBeNull();
    expect(matchSearchCandidate('boxes', { name: 'Storage Box 10L' })).not.toBeNull();
    expect(matchSearchCandidate('batteries', { name: 'Energizer AA Battery' })).not.toBeNull();
    expect(matchSearchCandidate('battery', { name: 'Duracell AA Batteries 12 Pack' })).not.toBeNull();
  });

  it('requires every query token to match', () => {
    expect(matchSearchCandidate('hot wheels kmart', { name: 'Hot Wheels Car', shops: ['Kmart'] })).not.toBeNull();
    expect(matchSearchCandidate('hot wheels bigw', { name: 'Hot Wheels Car', shops: ['Kmart'] })).toBeNull();
  });

  it('supports light fuzzy tolerance (<=1 for >=4 chars, <=2 for >=8 chars)', () => {
    // 5 chars, 1 transposition
    expect(matchSearchCandidate('kmrat', { name: 'Lego Set', shops: ['Kmart'] })?.kind).toBe('fuzzy');
    // 6 chars, 1 deletion
    expect(matchSearchCandidate('batery', { name: 'AA Battery Pack' })?.kind).toBe('fuzzy');
    // 9 chars, 2 edits ("playstation" -> "plystaton")
    expect(matchSearchCandidate('plystaton', { name: 'Sony PlayStation 5' })?.kind).toBe('fuzzy');
    // 5 chars, 2 edits should NOT match
    expect(matchSearchCandidate('kzzrt', { name: 'Lego Set', shops: ['Kmart'] })).toBeNull();
  });

  it('avoids false positives for very short tokens (< 4 chars)', () => {
    expect(matchSearchCandidate('cat', { name: 'Hot Wheels Car' })).toBeNull();
    expect(matchSearchCandidate('car', { name: 'Chocolate Bar' })).toBeNull();
    expect(matchSearchCandidate('tv', { name: 'Activity Book' })).toBeNull();
    expect(matchSearchCandidate('x', { name: 'Storage Box' })).toBeNull();
    expect(matchSearchCandidate('a b', { name: 'About Time' })).toBeNull();
    // Exact / prefix short tokens still match properly
    expect(matchSearchCandidate('car', { name: 'Hot Wheels Car' })?.kind).toBe('exact');
    expect(matchSearchCandidate('ca', { name: 'Hot Wheels Car' })?.kind).toBe('prefix');
  });

  it('strips accents when matching', () => {
    expect(matchSearchCandidate('creme', { name: 'Crème Brûlée Dessert' })).not.toBeNull();
  });
});

describe('rankSearchItems', () => {
  it('ranks exact > prefix > fuzzy', () => {
    const items = [
      { id: 'fuzzy', name: 'Smart Watch' },
      { id: 'prefix', name: 'Kmarting Guide' },
      { id: 'exact', name: 'Kmart Toy Car' }
    ];
    const ranked = rankSearchItems('kmart', items, (item) => ({ name: item.name }));
    expect(ranked.map((r) => r.item.id)).toEqual(['exact', 'prefix', 'fuzzy']);
  });

  it('ranks name matches above shop matches', () => {
    const items = [
      { id: 'shop', name: 'Wooden Blocks', shops: ['Kmart'] },
      { id: 'name', name: 'Kmart Gift Card', shops: ['Big W'] }
    ];
    const ranked = rankSearchItems('kmart', items, (item) => ({ name: item.name, shops: item.shops }));
    expect(ranked.map((r) => r.item.id)).toEqual(['name', 'shop']);
  });

  it('respects the limit parameter', () => {
    const items = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `p${n}`, name: `Hot Wheels ${n}` }));
    const ranked = rankSearchItems('hot wheels', items, (item) => ({ name: item.name }), 5);
    expect(ranked).toHaveLength(5);
  });
});

describe('isNearIdenticalName', () => {
  it('detects spacing, punctuation and plural variants as near-identical', () => {
    expect(isNearIdenticalName('Hot Wheels 5-Pack Cars', 'HotWheels 5 Pack Car')).toBe(true);
    expect(isNearIdenticalName('LEGO Technic Porsche 911 GT3', 'Lego Technic Porsche 911 GT3')).toBe(true);
  });

  it('does not confuse different pack sizes or unrelated products', () => {
    expect(isNearIdenticalName('Hot Wheels 5-Pack', 'Hot Wheels 10-Pack')).toBe(false);
    expect(isNearIdenticalName('Hot Wheels Car', 'Matchbox Car')).toBe(false);
  });
});

describe('addRecentSearch', () => {
  it('deduplicates, keeps newest first, and caps at 5', () => {
    let list: string[] = [];
    for (const q of ['lego', 'hot wheels', 'matchbox', 'coffee', 'milk', 'bread']) {
      list = addRecentSearch(list, q);
    }
    expect(list).toEqual(['bread', 'milk', 'coffee', 'matchbox', 'hot wheels']);
    list = addRecentSearch(list, 'Hot-Wheels');
    expect(list).toEqual(['Hot-Wheels', 'bread', 'milk', 'coffee', 'matchbox']);
  });
});
