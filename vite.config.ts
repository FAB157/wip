import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg', 'icon.png'],
        manifest: {
          name: 'WIP - World in pocket',
          short_name: 'WIP',
          description: 'Your global personal tour guide in your pocket.',
          theme_color: '#1e3a8a',
          background_color: '#f8f5f0',
          display: 'standalone',
          orientation: 'portrait',
          related_applications: [{
            platform: "play",
            url: "https://play.google.com/store/apps/details?id=com.itaintasca.app",
            id: "com.itaintasca.app"
          }],
          prefer_related_applications: true,
          icons: [
            {
              src: 'icon.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'icon.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: 'icon.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
          maximumFileSizeToCacheInBytes: 5000000,
          // Le pagine legali statiche (compliance store) vivono FUORI dalla SPA:
          // senza denylist il service worker rispondeva a /privacy &co. con
          // index.html (navigation fallback) per chi aveva già il SW attivo.
          navigateFallbackDenylist: [/^\/privacy/, /^\/terms/, /^\/support/, /^\/delete-account/, /^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/.*\.basemaps\.cartocdn\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'map-tiles-cache',
                expiration: {
                  // 100 voci = una schermata scarsa: le aree offline
                  // prefetchate da offlineTiles.ts (stessa cache) venivano
                  // subito sfrattate e la mappa restava vuota senza rete.
                  maxEntries: 20000,
                  maxAgeSeconds: 60 * 60 * 24 * 60
                }
              }
            },
            {
              // Tile OSM usate da PlanMap (mappa itinerario): prima nessuna
              // regola le copriva, quindi zero cache anche appena visitate.
              urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'osm-tiles-cache',
                expiration: {
                  maxEntries: 2000,
                  maxAgeSeconds: 60 * 60 * 24 * 30
                }
              }
            },
            {
              urlPattern: /^https:\/\/.*\.supabase\.(co|in)\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'supabase-cache',
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 60 * 60 * 24
                }
              }
            },
            {
              urlPattern: /.*\.mp3$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'audio-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 7
                }
              }
            }
          ]
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        '@capacitor-community/background-geolocation': path.resolve(__dirname, 'src/stubs/background-geolocation.ts'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: ['**/tts_usage.json', '**/tts_cache/**']
      }
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // Mai pubblicare i sorgenti in produzione: sourcemap:true emetteva
      // anche server.cjs.map (backend completo con commenti) servito
      // pubblicamente da dist/. Attiva solo in sviluppo se serve debuggare.
      sourcemap: mode !== 'production',
      rollupOptions: {
        external: ['html2pdf.js'],
        output: {
          // Split vendor/main: senza React.lazy sui pannelli pesanti (il vero
          // guadagno di first-paint, follow-up da testare a runtime) togliere
          // del tutto manualChunks collassava in UN file da 2,16 MB
          // ri-scaricato a ogni deploy. Con lo split, vendor (~0,9 MB, cambia
          // di rado) resta in cache tra i deploy.
          manualChunks(id) {
            if (id.includes('node_modules')) return 'vendor';
            if (id.includes('/src/')) return 'main';
          }
        }
      }
    }
  };
});
