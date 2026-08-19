import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PriceTracker',
  description: 'Australia price matrix monitoring'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

