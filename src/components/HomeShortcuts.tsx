import { BookOpen, PackagePlus, Scale, Tag, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

type ShortcutItem = {
  key: 'deals' | 'compare' | 'add' | 'about';
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  requiresAccount?: boolean;
};

const SHORTCUTS: ShortcutItem[] = [
  {
    key: 'deals',
    href: '/deals',
    title: 'Deals',
    description: 'Bargains at your shops',
    icon: Tag
  },
  {
    key: 'compare',
    href: '/compare',
    title: 'Compare',
    description: 'Which shop is cheaper?',
    icon: Scale,
    requiresAccount: true
  },
  {
    key: 'add',
    href: '/add',
    title: 'Add',
    description: 'Track a new product',
    icon: PackagePlus,
    requiresAccount: true
  },
  {
    key: 'about',
    href: '/about',
    title: 'Guide',
    description: 'How to use it',
    icon: BookOpen
  }
];

export default function HomeShortcuts({ signedIn }: { signedIn: boolean }) {
  return (
    <section className={`home-shortcuts${signedIn ? ' is-compact' : ''}`} aria-label="Quick links">
      <ul className="home-shortcuts-grid">
        {SHORTCUTS.map((item) => {
          const Icon = item.icon;
          const gated = !signedIn && item.requiresAccount;
          const href = gated ? '/register' : item.href;
          const description = gated ? 'Free account needed' : item.description;

          return (
            <li key={item.key}>
              <Link href={href} className={`home-shortcut-card is-${item.key}`}>
                <span className="home-shortcut-icon" aria-hidden="true">
                  <Icon size={signedIn ? 18 : 20} strokeWidth={1.9} />
                </span>
                <span className="home-shortcut-copy">
                  <strong className="home-shortcut-title">{item.title}</strong>
                  <span className="home-shortcut-desc">{description}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
