// BreaWorlds Tools - Progressive Web App Service Worker (sw.js)
const CACHE_NAME = 'bw-tools-v3.15.5';

// Core assets to pre-cache immediately on service worker install
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './tutorial.css',
  './community.css',
  './community.html',
  './community.js',
  './multiplayer.js',
  './thumbnail.js',
  './tm_consumables_manifest.js',
  './manifest.json',
  './assets/icon.png',
  './assets/apple-touch-icon.png',
  './arm.png',
  './base.png',
  './baseskate.png',
  './body.png',
  './facemech.png',
  './feet.png',
  './head.png',
  './leg.png',
  './legskate.png',
  './pupil.png',
  './libs/lucide.min.js',
  './libs/html2canvas.min.js',
  './libs/peerjs.min.js',
  './libs/firebase-app-compat.js',
  './libs/firebase-firestore-compat.js',
  './libs/firebase-storage-compat.js',
  './js/set-planner.js',
  './js/fish-calculator.js',
  './js/block-spotlight.js',
  './js/world-planner.js',
  './js/bug-reporter.js',
  './js/main.js'
];

// Perform install steps and cache critical assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Pre-caching core application shell...');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Clean up old caches on activation
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating and sweeping old caches...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting obsolete cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch interceptor
self.addEventListener('fetch', event => {
  // Only handle GET requests and skip external non-HTTP schemes
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Serve static/core assets immediately from cache
          return cachedResponse;
        }

        return fetch(event.request).then(response => {
          // If response is invalid, return it directly
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // DYNAMIC CACHING FOR CUSTOM ASSETS
          // Cache images (sprites, items, backgrounds) and manifests dynamically on-the-fly
          const url = event.request.url;
          const isAsset = url.includes('/hats/') || 
                          url.includes('/shirts/') || 
                          url.includes('/shoes/') || 
                          url.includes('/pants/') || 
                          url.includes('/wings/') || 
                          url.includes('/faces/') || 
                          url.includes('/hair/') || 
                          url.includes('/hands/') || 
                          url.includes('/scarfs/') || 
                          url.includes('/pets/') || 
                          url.includes('/specials/') || 
                          url.includes('/capes/') || 
                          url.includes('/cars/') || 
                          url.includes('/floaties/') || 
                          url.includes('/backgrounds/') || 
                          url.includes('/worldplanner/') || 
                          url.includes('/badges/') || 
                          url.includes('/display/') || 
                          url.includes('/fonts/') || 
                          url.endsWith('.png') || 
                          url.endsWith('.json');

          if (isAsset) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }

          return response;
        }).catch(err => {
          console.warn('[Service Worker] Network request failed for:', event.request.url, err);
          // Return nothing or custom offline fallback if needed
        });
      })
  );
});
