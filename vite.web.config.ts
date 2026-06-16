import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Standalone web build/serve of the renderer — the same `renderer/` React app
 * served as a website (no Electron), now installable as a PWA. Mirrors the
 * `renderer` block of electron.vite.config.ts. In dev, `/api` is proxied to the
 * Hono API so the fetch bridge can use same-origin relative URLs (no CORS).
 *   npm run dev:web     -> http://localhost:5173
 *   npm run build:web   -> out/web  (includes manifest.webmanifest + sw.js)
 */
export default defineConfig({
  root: resolve(__dirname, 'renderer'),
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      devOptions: { enabled: true },
      workbox: {
        // Never let the service worker shadow the API — always go to network.
        navigateFallbackDenylist: [/^\/api/],
      },
      manifest: {
        name: 'Hyprride Inventory',
        short_name: 'Hyprride',
        description: 'Hyprride Bike Rentals — servicing & parts inventory',
        theme_color: '#111111',
        background_color: '#f8f7f2',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'renderer'),
      '@shared': resolve(__dirname, 'shared'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'out/web'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
