import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // The Electron build loads dist/index.html straight off disk via
  // file:// (electron/main.js's loadFile), where an absolute "/..." path
  // resolves from the filesystem root, not from dist/ - it needs every
  // asset reference to be relative instead. GitHub Pages needs the
  // opposite: an absolute base so deep-linked/refreshed routes still
  // resolve under /PindiCADViewer/. Same vite.config.ts, so the two
  // targets are told apart by --mode electron (see package.json's
  // build:electron script) rather than picking one base for both.
  const isElectron = mode === 'electron'

  return {
    base: isElectron ? './' : '/PindiCADViewer/',
    plugins: [
      react(),
      tailwindcss(),
      // A service worker offers nothing inside an already-fully-offline,
      // installed desktop app (there's no "cache for next visit" to win),
      // and file:// origins generally refuse SW registration anyway -
      // left in, it'd just be dead weight in the installer plus a
      // registration-rejected error on every launch.
      !isElectron &&
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon.svg', 'logo.png'],
          manifest: {
            name: 'PindiCADViewer',
            short_name: 'PindiCAD',
            description: 'Puissance Mécanique et Précision 3D',
            theme_color: '#1a1a2e',
            background_color: '#1a1a2e',
            display: 'standalone',
            orientation: 'any',
            start_url: '.',
            scope: '.',
            icons: [
              { src: 'logo-192.png', sizes: '192x192', type: 'image/png' },
              { src: 'logo-512.png', sizes: '512x512', type: 'image/png' },
              { src: 'logo-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,png,svg,wasm}'],
            // occt-import-js.wasm (the STEP-parsing WASM module, served
            // from public/occt-import-js/) is ~7.3MB on its own - the 5MB
            // default cap would make workbox silently refuse to precache
            // it, so the very file this viewer depends on most would
            // never work offline.
            maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
          },
        }),
    ],
    worker: {
      format: 'iife',
    },
  }
})
