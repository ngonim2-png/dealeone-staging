import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'favicon-64.png', 'apple-touch-icon.png'],
      workbox: {
        // Push-notification handlers live in a small hand-written file the generated
        // service worker imports (see public/push-sw.js).
        importScripts: ['push-sw.js'],
        runtimeCaching: [
          {
            // Photos/voice notes never change once uploaded (the API marks them immutable),
            // so each is downloaded once and then served from the phone.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/media/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'dealeone-media',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // The public listings/events feed: always try the network first (fresh prices),
            // but fall back to the last copy after 4s or when offline, so the app opens
            // with something useful on a bad connection instead of a blank map.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && /^\/api\/(listings|events)(\/|\?|$)/.test(url.pathname + (url.search ? '?' : '')),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'dealeone-feed',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 3 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      manifest: {
        name: 'DEALEONE — Find It. Near You.',
        short_name: 'DEALEONE',
        description:
          'A location-first, AI-powered local commerce marketplace for Sierra Leone.',
        theme_color: '#f7f8f6',
        background_color: '#f7f8f6',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
