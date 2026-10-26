import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages project site (PHASE1-DEEP-DIVE D1): the game lives under
// /animal-sanctuary/. No router, so no SPA fallback is needed.
// PWA (P1.4, deep-dive D2): Home Screen installation is layer 1 of the
// save-safety net — an installed PWA is exempt from Safari's 7-day
// script-writable-storage deletion. autoUpdate keeps the family on the
// newest build without prompts; the precache makes it fully offline.
export default defineConfig({
  base: '/animal-sanctuary/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Animal Sanctuary',
        short_name: 'Sanctuary',
        description:
          'A tiny animal rescue sanctuary — feed, pet, play, and find every rescue a forever home.',
        theme_color: '#fffbeb',
        background_color: '#fffbeb',
        display: 'standalone',
        scope: '/animal-sanctuary/',
        start_url: '/animal-sanctuary/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: '/animal-sanctuary/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
