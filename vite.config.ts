/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Never update silently mid-sale: show "Versi baru tersedia" and let the user reload.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      // Generic name/icon per decision #10 (per-brand PWA identity is deferred).
      manifest: {
        name: 'Kasiko — Kasir & Keuangan',
        short_name: 'Kasiko',
        description: 'Aplikasi kasir dan keuangan usaha',
        lang: 'id',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: '#0f172a',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell: every built asset, so the cashier opens fully offline.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // API traffic (Supabase) is never cached by the service worker; offline data
        // lives in IndexedDB where the app controls it.
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rolldownOptions: {
      output: {
        // Stable vendor chunks: a deploy usually only changes app code, so cashier
        // phones re-download a small chunk instead of the whole bundle.
        codeSplitting: {
          // Module ids use forward slashes on every OS.
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules\/(react|react-dom|react-router|scheduler)\//,
            },
            {
              name: 'vendor-ui',
              test: /node_modules\/(radix-ui|@radix-ui|@floating-ui|lucide-react|sonner|cn|class-variance-authority)\//,
            },
            { name: 'vendor-data', test: /node_modules\/(dexie|dexie-react-hooks)\// },
          ],
        },
      },
    },
  },
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.ts'],
    // Unit tests never talk to the real project, whatever .env.local contains.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '', VITE_SUPABASE_ANON_KEY: '' },
  },
})
