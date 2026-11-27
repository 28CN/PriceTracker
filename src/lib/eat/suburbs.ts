import { PERTH_CBD } from './geo';

function normalize(value: string): string {
  return value.toLowerCase().replace(/['’`]/g, '').trim();
}

/**
 * Filter Perth suburbs for the combobox: case- and apostrophe-insensitive,
 * prefix matches first (alphabetical), then contains matches, capped at max.
 * Empty query returns Perth CBD first followed by alphabetical suburbs.
 */
export function filterSuburbs(suburbs: string[], query: string, max = 8): string[] {
  const unique = new Set<string>();
  const others: string[] = [];
  for (const name of suburbs) {
    if (!name || name === PERTH_CBD.name || unique.has(name)) continue;
    unique.add(name);
    others.push(name);
  }
  others.sort((a, b) => a.localeCompare(b));

  const q = normalize(query);
  if (!q) {
    return [PERTH_CBD.name, ...others].slice(0, max);
  }

  const all = [PERTH_CBD.name, ...others];
  const prefix: string[] = [];
  const contains: string[] = [];
  for (const name of all) {
    const norm = normalize(name);
    if (norm.startsWith(q)) prefix.push(name);
    else if (norm.includes(q)) contains.push(name);
  }
  prefix.sort((a, b) => a.localeCompare(b));
  contains.sort((a, b) => a.localeCompare(b));
  return [...prefix, ...contains].slice(0, max);
}
