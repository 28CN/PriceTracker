import type { Metadata, Viewport } from 'next';
import { Figtree } from 'next/font/google';

import TopBar from '@/components/TopBar';

import './globals.css';

const figtree = Figtree({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans'
});

export const metadata: Metadata = {
  title: 'PriceTracker',
  description: 'Track Australian shop prices for the products you care about',
  applicationName: 'PriceTracker',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-touch-icon.png' }]
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eef3f0' },
    { media: '(prefers-color-scheme: dark)', color: '#121816' }
  ]
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={figtree.variable} style={{ colorScheme: 'light dark' }}>
      <body>
        <div className="app-shell">
          <TopBar />
          <div className="page">{children}</div>
        </div>
      </body>
    </html>
  );
}
