import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Farm-E — Direct Farm Market',
        short_name: 'Farm-E',
        description: 'Connect farmers directly with buyers — pre-harvest listings and procurement bidding',
        theme_color: '#11212d',
        background_color: '#f4f6f5',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            // Keep third-party map tiles out of the image cache. A cached blocked tile
            // response would otherwise keep a map blank after its key/referrer is fixed.
            urlPattern: ({ url }) => url.origin === self.location.origin && /\.(png|jpg|jpeg|svg|gif|webp)$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'farm-e-images-v2',
              expiration: { maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['athletic-milton-ave-volleyball.trycloudflare.com'],
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:5000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:5000', ws: true, changeOrigin: true },
    },
  },
  resolve: {
    alias: { '@': '/src' },
  },
});
