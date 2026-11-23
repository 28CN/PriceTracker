'use client';

import { Laptop, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

type Theme = 'system' | 'light' | 'dark';

function nextTheme(theme: Theme): Theme {
  const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const cycle: Theme[] = systemIsDark
    ? ['system', 'light', 'dark']
    : ['system', 'dark', 'light'];
  return cycle[(cycle.indexOf(theme) + 1) % cycle.length];
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
  root.style.colorScheme = resolved;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'color-scheme';
    document.head.appendChild(meta);
  }
  meta.content = theme === 'system' ? 'light dark' : theme;
  window.localStorage.setItem('pricetracker.theme', theme);
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const saved = window.localStorage.getItem('pricetracker.theme');
    const initial = saved === 'light' || saved === 'dark' ? saved : 'system';
    setTheme(initial);
    applyTheme(initial);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncSystem = () => {
      if ((window.localStorage.getItem('pricetracker.theme') || 'system') === 'system') {
        applyTheme('system');
      }
    };
    media.addEventListener('change', syncSystem);
    return () => media.removeEventListener('change', syncSystem);
  }, []);

  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Laptop;
  const label = `Theme: ${theme}. Click to change.`;

  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={label}
      onClick={() => {
        const next = nextTheme(theme);
        setTheme(next);
        applyTheme(next);
      }}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
