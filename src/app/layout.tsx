import type { Metadata, Viewport } from 'next';

import TopBar from '@/components/TopBar';

import './globals.css';

export const metadata: Metadata = {
  title: 'PriceTracker',
  description: 'Compare Australian shop prices for the toys we keep an eye on'
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body>
        <TopBar />
        <div className="page">{children}</div>
      </body>
    </html>
  );
}
