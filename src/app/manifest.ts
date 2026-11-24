import type { MetadataRoute } from 'next';

// Installing the site (Android: Chrome menu, "Add to home screen") puts
// PriceTracker in the share sheet. A shared shop page opens /add.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'PriceTracker',
    short_name: 'PriceTracker',
    description: 'Track Australian shop prices for the products you care about',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#eef3f0',
    theme_color: '#eef3f0',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ],
    share_target: {
      action: '/add',
      method: 'GET',
      params: { title: 'title', text: 'text', url: 'url' }
    }
  };
}
