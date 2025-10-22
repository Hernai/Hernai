/**
 * Service Worker para INE Scanner AI
 * Habilita funcionamiento offline y caché de recursos
 */

const CACHE_NAME = 'ine-scanner-ai-v1.0.0';
const CACHE_URLS = [
    './',
    './index.html',
    './manifest.json',
    './css/styles.css',
    './js/app.js',
    './js/ocr-engine.js',
    './js/ine-detector.js',
    './js/image-processor.js',
    './js/field-extractor.js',
    './js/validators.js',
    './js/main.js'
];

// CDN resources (cached separately)
const CDN_CACHE = 'ine-scanner-ai-cdn-v1.0.0';
const CDN_URLS = [
    'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.10.0/dist/transformers.min.js',
    'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
    'https://docs.opencv.org/4.5.4/opencv.js'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');

    event.waitUntil(
        Promise.all([
            caches.open(CACHE_NAME).then((cache) => {
                console.log('[SW] Caching app resources');
                return cache.addAll(CACHE_URLS);
            }),
            caches.open(CDN_CACHE).then((cache) => {
                console.log('[SW] Caching CDN resources');
                return cache.addAll(CDN_URLS).catch(err => {
                    console.warn('[SW] Some CDN resources failed to cache:', err);
                });
            })
        ]).then(() => {
            console.log('[SW] Service worker installed successfully');
            return self.skipWaiting();
        })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== CDN_CACHE) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[SW] Service worker activated');
            return self.clients.claim();
        })
    );
});

// Fetch event - serve from cache when available
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip chrome extensions and non-http(s) requests
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return;
    }

    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
                console.log('[SW] Serving from cache:', request.url);
                return cachedResponse;
            }

            console.log('[SW] Fetching from network:', request.url);
            return fetch(request).then((response) => {
                // Don't cache POST requests or failed responses
                if (request.method !== 'GET' || !response || response.status !== 200) {
                    return response;
                }

                // Clone the response
                const responseToCache = response.clone();

                // Determine which cache to use
                const cacheName = CDN_URLS.some(u => request.url.includes(u))
                    ? CDN_CACHE
                    : CACHE_NAME;

                // Cache the response
                caches.open(cacheName).then((cache) => {
                    cache.put(request, responseToCache);
                });

                return response;
            }).catch((error) => {
                console.error('[SW] Fetch failed:', error);

                // Return a custom offline page if available
                if (request.destination === 'document') {
                    return caches.match('./offline.html');
                }

                throw error;
            });
        })
    );
});

// Handle messages from the app
self.addEventListener('message', (event) => {
    console.log('[SW] Message received:', event.data);

    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => caches.delete(cacheName))
                );
            }).then(() => {
                console.log('[SW] All caches cleared');
                event.ports[0].postMessage({ success: true });
            })
        );
    }
});

// Background sync for offline operations
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync:', event.tag);

    if (event.tag === 'sync-ocr-results') {
        event.waitUntil(syncOCRResults());
    }
});

async function syncOCRResults() {
    // Placeholder for syncing OCR results when back online
    console.log('[SW] Syncing OCR results...');
    // Implement your sync logic here
}

// Push notifications (optional)
self.addEventListener('push', (event) => {
    console.log('[SW] Push notification received');

    const options = {
        body: event.data ? event.data.text() : 'Nueva notificación',
        icon: './assets/icons/icon-192x192.png',
        badge: './assets/icons/icon-72x72.png',
        vibrate: [200, 100, 200],
        tag: 'ine-scanner-notification',
        requireInteraction: false
    };

    event.waitUntil(
        self.registration.showNotification('INE Scanner AI', options)
    );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked');
    event.notification.close();

    event.waitUntil(
        clients.openWindow('./')
    );
});

console.log('[SW] Service worker script loaded');
