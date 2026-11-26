export type CategoryIconKey =
  | 'household'
  | 'pantry'
  | 'toys'
  | 'cars'
  | 'baby'
  | 'pets'
  | 'health'
  | 'tech'
  | 'hardware'
  | 'clothing'
  | 'books'
  | 'tag';

const CATEGORY_ICON_RULES: { key: CategoryIconKey; pattern: RegExp }[] = [
  {
    key: 'cars',
    pattern: /\b(hot\s*wheels?|matchbox|cars?|auto|automotive|motor|vehicles?|diecast)\b/i
  },
  {
    key: 'toys',
    pattern: /\b(toys?|lego|bluey|plush|dolls?|puzzles?|games?|play|figures?|kids?|barbie|nerf|pokemon)\b/i
  },
  {
    key: 'baby',
    pattern: /\b(baby|babies|napp(?:y|ies)|diapers?|infant|toddler|formula|nursery|pram|wipes)\b/i
  },
  {
    key: 'pets',
    pattern: /\b(pets?|dogs?|cats?|pupp(?:y|ies)|kittens?|birds?|fish|litter|vet)\b/i
  },
  {
    key: 'pantry',
    pattern: /\b(pantry|food|grocer(?:y|ies)|snacks?|drinks?|coffee|tea|cereal|pasta|bakery|dairy|meat|fruit|veg|supermarket|chocolate|lollies|biscuits)\b/i
  },
  {
    key: 'household',
    pattern: /\b(household|home|clean(?:ing|er|ers)?|laundry|kitchen|bath(?:room)?|bedding|living|paper|tissue|detergent)\b/i
  },
  {
    key: 'health',
    pattern: /\b(health|pharmac(?:y|ies)|chemist|medicine|vitamins?|beauty|skincare|makeup|toiletries|personal|dental|hygiene)\b/i
  },
  {
    key: 'tech',
    pattern: /\b(tech|electronics?|gaming|computers?|laptops?|phones?|audio|headphones?|cameras?|tv|gadgets?)\b/i
  },
  {
    key: 'hardware',
    pattern: /\b(garden|hardware|tools?|diy|outdoor|bunnings|paint|lighting|camping)\b/i
  },
  {
    key: 'clothing',
    pattern: /\b(cloth(?:es|ing)|fashion|shoes?|apparel|wear|jackets?|socks?|activewear)\b/i
  },
  {
    key: 'books',
    pattern: /\b(books?|stationery|office|school|study|reading|craft|art)\b/i
  }
];

/** Pick a semantic icon key from a category name, defaulting to 'tag'. */
export function categoryIconKey(category: string | null | undefined): CategoryIconKey {
  const raw = (category ?? '').trim();
  if (!raw) return 'tag';
  for (const rule of CATEGORY_ICON_RULES) {
    if (rule.pattern.test(raw)) return rule.key;
  }
  return 'tag';
}
