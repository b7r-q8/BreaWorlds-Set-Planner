// BreaWorlds Tools - Progressive Web App Service Worker (sw.js)
const CACHE_NAME = 'bw-tools-v3.15.7';

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

  const url = new URL(event.request.url);
  // Use Network-First for HTML and CSS files so updates show up immediately on refresh
  const isNetworkFirst = url.pathname === '/' || 
                         url.pathname.endsWith('index.html') || 
                         url.pathname.endsWith('style.css');

  if (isNetworkFirst) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
            return response;
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache if network is offline
          return caches.match(event.request);
        })
    );
  } else {
    // Cache-First strategy for static assets
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
            const urlStr = event.request.url;
            const isAsset = urlStr.includes('/hats/') || 
                            urlStr.includes('/shirts/') || 
                            urlStr.includes('/shoes/') || 
                            urlStr.includes('/pants/') || 
                            urlStr.includes('/wings/') || 
                            urlStr.includes('/faces/') || 
                            urlStr.includes('/hair/') || 
                            urlStr.includes('/hands/') || 
                            urlStr.includes('/scarfs/') || 
                            urlStr.includes('/pets/') || 
                            urlStr.includes('/specials/') || 
                            urlStr.includes('/capes/') || 
                            urlStr.includes('/cars/') || 
                            urlStr.includes('/floaties/') || 
                            urlStr.includes('/backgrounds/') || 
                            urlStr.includes('/worldplanner/') || 
                            urlStr.includes('/badges/') || 
                            urlStr.includes('/display/') || 
                            urlStr.includes('/fonts/') || 
                            urlStr.endsWith('.png') || 
                            urlStr.endsWith('.json');

            if (isAsset) {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseToCache);
              });
            }

            return response;
          }).catch(err => {
            console.warn('[Service Worker] Network request failed for:', event.request.url, err);
          });
        })
    );
  }
});
