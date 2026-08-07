const CACHE_NAME = 'itainta-v1';
const DYNAMIC_CACHE = 'itainta-dynamic-v1';
const MAP_CACHE = 'itainta-map-tiles-v1';
const AUDIO_CACHE = 'itainta-audio-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.png',
  '/avatar.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (![CACHE_NAME, DYNAMIC_CACHE, MAP_CACHE, AUDIO_CACHE].includes(key)) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Map tiles cache (Cache First, fallback to Network)
  if (url.hostname.includes('tile.openstreetmap.org') || url.hostname.includes('mapbox.com') || url.hostname.includes('basemaps.cartocdn.com')) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(MAP_CACHE).then((cache) => cache.put(request, responseClone));
          return networkResponse;
        });
      })
    );
    return;
  }

  // Audio TTS cache (Cache First, fallback to Network)
  if (url.pathname.endsWith('.mp3') || url.pathname.endsWith('.wav') || url.hostname.includes('tts')) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(AUDIO_CACHE).then((cache) => cache.put(request, responseClone));
          return networkResponse;
        });
      })
    );
    return;
  }

  // API calls for POIs JSON (Stale While Revalidate or Network First)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).then((networkResponse) => {
        const responseClone = networkResponse.clone();
        caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, responseClone));
        return networkResponse;
      }).catch(() => {
        return caches.match(request);
      })
    );
    return;
  }

  // Default Network First, fallback to Cache for other assets
  event.respondWith(
    fetch(request).then((networkResponse) => {
      const responseClone = networkResponse.clone();
      caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, responseClone));
      return networkResponse;
    }).catch(() => {
      return caches.match(request);
    })
  );
});
