// Capture public pages at phone and desktop widths, light and dark.
// Usage: BASE=https://pricetracker-au.vercel.app node scripts/mobile-shots.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const base = process.env.BASE || 'https://pricetracker-au.vercel.app';
const pages = ['/', '/login', '/register', '/demo-shop'];
const sizes = { phone: '390,844', desktop: '1440,900' };
mkdirSync('/tmp/shots', { recursive: true });

for (const path of pages) {
  for (const [label, size] of Object.entries(sizes)) {
    for (const dark of [false, true]) {
      const name = `${path.replace(/\W+/g, '_') || 'home'}-${label}-${dark ? 'dark' : 'light'}.png`;
      const args = ['--headless=new', '--no-sandbox', '--hide-scrollbars', `--window-size=${size}`, `--screenshot=/tmp/shots/${name}`];
      if (dark) args.push('--force-dark-mode', '--blink-settings=preferredColorScheme=0');
      execFileSync('google-chrome', [...args, base + path], { stdio: 'ignore' });
      console.log(name);
    }
  }
}
