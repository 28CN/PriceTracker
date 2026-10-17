import { validateUsername } from '@/lib/auth';

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

// Compared after separators and common digit swaps are removed.
// Short terms match the whole name. Longer slurs also match inside a name.
const BLOCKED_EXACT = new Set([
  'porn',
  'porno',
  'xxx',
  'nude',
  'nudes',
  'hentai',
  'cunt',
  'whore',
  'fag',
  'kike',
  'spic',
  'gook',
  'paki',
  'pricetracker',
  'pricetrack',
  'official',
  'staff',
  'moderator',
  'administrator',
  'webmaster',
  'helpdesk',
  'root',
  'system'
]);

const BLOCKED_WITHIN = [
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'tranny',
  'chink',
  'wetback'
];

export function normalisePublicSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/@/g, 'a')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/[^a-z]/g, '');
}

export function isPublicSlugShape(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

export function validatePublicSlug(slug: string): string | null {
  if (!isPublicSlugShape(slug)) {
    return 'Use 3–30 lowercase letters, numbers or single hyphens.';
  }
  const reserved = validateUsername(slug);
  if (reserved) {
    return reserved === 'That username is reserved.'
      ? 'That public name is reserved.'
      : reserved;
  }
  const normalised = normalisePublicSlug(slug);
  if (
    BLOCKED_EXACT.has(normalised) ||
    BLOCKED_WITHIN.some((term) => normalised.includes(term))
  ) {
    return "That public name isn't available.";
  }
  return null;
}
