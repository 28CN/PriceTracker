import type { Metadata, Viewport } from 'next';
import { Figtree } from 'next/font/google';

import AmbientBackground from '@/components/AmbientBackground';
import TopBar from '@/components/TopBar';

import './globals.css';

const criticalFallbackCss = `
  :where(*){box-sizing:border-box}
  :where(html,body){margin:0;min-height:100%;background:#f3f5f8;color:#1d2433}
  :where(body){font-family:Arial,sans-serif}
  :where(img){max-width:100%;height:auto}
  :where(.app-shell){position:relative;min-height:100vh;overflow:hidden}
  :where(.ambient-background){position:fixed;inset:0;z-index:-1;width:100%;height:100%;pointer-events:none}
  :where(.topbar-inner,.page){width:100%;max-width:1180px;margin-inline:auto}
  :where(.topbar-inner,.topbar-actions,.brand-link){display:flex;align-items:center}
  :where(.topbar-inner){justify-content:space-between;padding:12px 16px}
  :where(.topbar-actions,.brand-link){gap:8px}
  :where(.page){padding:20px 16px 56px}
  :where(.dashboard-hero,.dashboard-overview,.manage-hero,.category-section,.card){overflow:hidden;border:1px solid #dfe3eb;border-radius:18px;background:#fff}
  :where(.dashboard-hero,.manage-hero){position:relative;padding:28px;margin-bottom:18px}
  :where(.dashboard-overview){display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px 22px;margin-bottom:18px}
  :where(.overview-actions,.target-summary,.account-slot){display:flex;align-items:center;gap:10px}
  :where(.target-summary,.account-slot){padding:10px;border:1px solid #e3e6ed}
  :where(.hero-art){position:absolute;right:0;top:0;width:40%;max-width:420px;height:auto;opacity:.35}
  :where(.hero-copy,.hero-stats){position:relative;z-index:1}
  :where(.hero-stats){display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}
  :where(.stat-card){padding:10px 12px;border:1px solid #e3e6ed;border-radius:12px}
  :where(.category-board,.category-stack,.stack){display:grid;gap:14px}
  :where(.category-body,.card){padding:12px}
  :where(.product-thumb){display:block;width:76px!important;height:76px!important;object-fit:contain}
  :where(.empty-illustration){width:150px;height:auto}
  @media(max-width:760px){
    :where(.dashboard-hero,.manage-hero){padding:22px}
    :where(.dashboard-overview){display:grid;padding:18px}
    :where(.account-slot){display:none}
    :where(.hero-art){width:230px;opacity:.2}
    :where(.product-thumb){width:64px!important;height:64px!important}
  }
  @media(prefers-color-scheme:dark){
    :where(html,body){background:#10131a;color:#edf0f7}
    :where(.dashboard-hero,.dashboard-overview,.manage-hero,.category-section,.card){background:#1a1f2a;border-color:#303746}
  }
`;

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
    <html lang="en-AU" className={figtree.variable} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: criticalFallbackCss }} />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('pricetracker.theme')||'system';document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t}catch(e){}"
          }}
        />
      </head>
      <body>
        <div className="app-shell">
          <AmbientBackground />
          <TopBar />
          <div className="page">{children}</div>
        </div>
      </body>
    </html>
  );
}
