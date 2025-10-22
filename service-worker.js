/**
 * Service Worker for Hernai INE Scanner PWA
 * Provides offline-first caching strategy for browser-only operation
 */

const CACHE_VERSION = 'hernai-v1.2.0';
const CACHE_NAME = `hernai-ine-scanner-${CACHE_VERSION}`;

// Static assets to cache on install
const STATIC_ASSETS = [
    './',
    './index.html',
    './main.js',
    './manifest.json',
    './assets/favicon.svg',

    // Core pipeline modules (Fase 1)
    './js/app.js',
    './js/image-processor.js',
    './js/card-detector.js',
    './js/ine-detector.js',
    './js/onnx-runtime.js',
    './js/ocr-engine.js',
    './js/ocr-corrector.js',
    './js/field-extractor.js',
    './js/ai-field-extractor.js',
    './js/validators.js',
    './js/layout.js',

    // Anti-fraud modules (Fase 2)
    './js/dedupe-hash.js',
    './js/antifraud-moire.js',
    './js/antifraud-ela.js',
    './js/link-front-back.js',
    './js/face-match.js'
];

// External libraries (CDN URLs)
const CDN_CACHE = `${CACHE_NAME}-cdn`;
const EXTERNAL_LIBS = [
    'https://cdn.jsdelivr.net/npm/opencv.js@1.2.1/opencv.js',
    'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
    'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',
    'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.0/dist/ort.min.js',
    'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.min.js',
    'https://fonts.googleapis.com/icon?family=Material+Icons'
];

// Dynamic content (models, templates) - cache as requested
const DYNAMIC_CACHE = `${CACHE_NAME}-dynamic`;

/**
 * Install Event - Cache static assets
 */
self.addEventListener('install', (event) => {
    console.log('[ServiceWorker] Installing...');

    event.waitUntil(
        Promise.all([
            // Cache static assets
            caches.open(CACHE_NAME).then((cache) => {
                console.log('[ServiceWorker] Caching static assets...');
                return cache.addAll(STATIC_ASSETS);
            }),

            // Cache external libraries
            caches.open(CDN_CACHE).then((cache) => {
                console.log('[ServiceWorker] Caching CDN resources...');
                return Promise.allSettled(
                    EXTERNAL_LIBS.map(url =>
                        cache.add(url).catch(err => {
                            console.warn(`[ServiceWorker] Failed to cache ${url}:`, err);
                        })
                    )
                );
            })
        ])
        .then(() => {
            console.log('[ServiceWorker] Installation complete');
            // Force activation immediately
            return self.skipWaiting();
        })
        .catch((error) => {
            console.error('[ServiceWorker] Installation failed:', error);
        })
    );
});

/**
 * Activate Event - Clean up old caches
 */
self.addEventListener('activate', (event) => {
    console.log('[ServiceWorker] Activating...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        // Delete old caches that don't match current version
                        if (cacheName.startsWith('hernai-') &&
                            cacheName !== CACHE_NAME &&
                            cacheName !== CDN_CACHE &&
                            cacheName !== DYNAMIC_CACHE) {
                            console.log('[ServiceWorker] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }

                        // Also clean up old cache names from previous versions
                        if (cacheName.startsWith('ine-scanner-ai')) {
                            console.log('[ServiceWorker] Deleting legacy cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[ServiceWorker] Activation complete');
                // Take control of all pages immediately
                return self.clients.claim();
            })
    );
});

/**
 * Fetch Event - Serve from cache, fallback to network
 * Strategy: Cache First (offline-first for static assets)
 *           Network First (for dynamic content)
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip Chrome extensions and other protocols
    if (!url.protocol.startsWith('http')) {
        return;
    }

    // Determine caching strategy based on request type
    if (isStaticAsset(url)) {
        // Static assets: Cache First
        event.respondWith(cacheFirst(request, CACHE_NAME));
    } else if (isExternalLib(url)) {
        // External libraries: Cache First with network fallback
        event.respondWith(cacheFirst(request, CDN_CACHE));
    } else if (isDynamicContent(url)) {
        // Models, templates: Network First with cache fallback
        event.respondWith(networkFirst(request));
    } else {
        // Default: Network First
        event.respondWith(networkFirst(request));
    }
});

/**
 * Cache First Strategy
 * Try cache first, fallback to network, update cache
 */
async function cacheFirst(request, cacheName) {
    try {
        // Check cache
        const cache = await caches.open(cacheName);
        const cachedResponse = await cache.match(request);

        if (cachedResponse) {
            console.log('[ServiceWorker] Cache hit:', request.url);
            return cachedResponse;
        }

        // Cache miss - fetch from network
        console.log('[ServiceWorker] Cache miss, fetching:', request.url);
        const networkResponse = await fetch(request);

        // Cache the response for future use
        if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            cache.put(request, responseToCache);
        }

        return networkResponse;

    } catch (error) {
        console.error('[ServiceWorker] Cache-first failed:', error);

        // Try dynamic cache as last resort
        const dynamicCache = await caches.open(DYNAMIC_CACHE);
        const fallback = await dynamicCache.match(request);

        if (fallback) {
            return fallback;
        }

        // Return offline page or error
        return new Response('Offline - Resource not available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
                'Content-Type': 'text/plain'
            })
        });
    }
}

/**
 * Network First Strategy
 * Try network first, fallback to cache if offline
 */
async function networkFirst(request) {
    try {
        // Try network first
        const networkResponse = await fetch(request);

        // Cache successful responses
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;

    } catch (error) {
        console.warn('[ServiceWorker] Network failed, trying cache:', request.url);

        // Network failed - try cache
        const cache = await caches.open(DYNAMIC_CACHE);
        const cachedResponse = await cache.match(request);

        if (cachedResponse) {
            console.log('[ServiceWorker] Serving from cache:', request.url);
            return cachedResponse;
        }

        // Try CDN cache as fallback
        const cdnCache = await caches.open(CDN_CACHE);
        const cdnResponse = await cdnCache.match(request);

        if (cdnResponse) {
            return cdnResponse;
        }

        // Try static cache as last resort
        const staticCache = await caches.open(CACHE_NAME);
        const staticResponse = await staticCache.match(request);

        if (staticResponse) {
            return staticResponse;
        }

        // No cache available
        return new Response('Offline - Resource not available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
                'Content-Type': 'text/plain'
            })
        });
    }
}

/**
 * Check if URL is a static asset
 */
function isStaticAsset(url) {
    const pathname = url.pathname;

    // Root HTML files
    if (pathname === '/' || pathname === '/index.html' || pathname.endsWith('.html')) {
        return true;
    }

    // JavaScript files in /js/
    if (pathname.startsWith('/js/') || pathname.includes('/js/')) {
        return true;
    }

    // Main JS
    if (pathname === '/main.js' || pathname.endsWith('main.js')) {
        return true;
    }

    // CSS files
    if (pathname.endsWith('.css')) {
        return true;
    }

    // Manifest
    if (pathname.endsWith('manifest.json')) {
        return true;
    }

    return false;
}

/**
 * Check if URL is an external library
 */
function isExternalLib(url) {
    const hostname = url.hostname;

    // CDN domains
    const cdnDomains = [
        'cdn.jsdelivr.net',
        'unpkg.com',
        'cdnjs.cloudflare.com',
        'fonts.googleapis.com',
        'fonts.gstatic.com'
    ];

    return cdnDomains.some(domain => hostname.includes(domain));
}

/**
 * Check if URL is dynamic content (models, templates)
 */
function isDynamicContent(url) {
    const pathname = url.pathname;

    // Model files
    if (pathname.includes('/models/')) {
        return true;
    }

    // Template images
    if (pathname.includes('/templates/')) {
        return true;
    }

    // Tesseract language data
    if (pathname.includes('traineddata')) {
        return true;
    }

    // ONNX models
    if (pathname.endsWith('.onnx')) {
        return true;
    }

    return false;
}

/**
 * Message Event - Handle messages from clients
 */
self.addEventListener('message', (event) => {
    const { type, payload } = event.data || {};

    switch (type) {
        case 'SKIP_WAITING':
            console.log('[ServiceWorker] Skip waiting requested');
            self.skipWaiting();
            break;

        case 'CACHE_URLS':
            // Cache specific URLs on demand
            console.log('[ServiceWorker] Caching URLs:', payload.urls);
            cacheURLs(payload.urls).then(() => {
                if (event.ports && event.ports[0]) {
                    event.ports[0].postMessage({ success: true });
                }
            });
            break;

        case 'CLEAR_CACHE':
            // Clear all caches
            console.log('[ServiceWorker] Clear cache requested');
            clearAllCaches().then(() => {
                if (event.ports && event.ports[0]) {
                    event.ports[0].postMessage({ success: true });
                }
            });
            break;

        case 'GET_CACHE_SIZE':
            // Calculate cache size
            getCacheSize().then(size => {
                if (event.ports && event.ports[0]) {
                    event.ports[0].postMessage({ size });
                }
            });
            break;

        default:
            console.warn('[ServiceWorker] Unknown message type:', type);
    }
});

/**
 * Cache specific URLs on demand
 */
async function cacheURLs(urls) {
    try {
        const cache = await caches.open(DYNAMIC_CACHE);
        await Promise.allSettled(
            urls.map(url =>
                cache.add(url).catch(err => {
                    console.warn(`[ServiceWorker] Failed to cache ${url}:`, err);
                })
            )
        );
        console.log('[ServiceWorker] URLs cached successfully');
    } catch (error) {
        console.error('[ServiceWorker] Failed to cache URLs:', error);
    }
}

/**
 * Clear all caches
 */
async function clearAllCaches() {
    try {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames.map(cacheName => {
                console.log('[ServiceWorker] Deleting cache:', cacheName);
                return caches.delete(cacheName);
            })
        );
        console.log('[ServiceWorker] All caches cleared');
    } catch (error) {
        console.error('[ServiceWorker] Failed to clear caches:', error);
    }
}

/**
 * Calculate total cache size
 */
async function getCacheSize() {
    try {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            const estimate = await navigator.storage.estimate();
            return {
                usage: estimate.usage,
                quota: estimate.quota,
                percentage: (estimate.usage / estimate.quota * 100).toFixed(2)
            };
        }
        return null;
    } catch (error) {
        console.error('[ServiceWorker] Failed to get cache size:', error);
        return null;
    }
}

/**
 * Sync Event - Background sync for offline actions
 */
self.addEventListener('sync', (event) => {
    console.log('[ServiceWorker] Background sync:', event.tag);

    if (event.tag === 'sync-results') {
        event.waitUntil(syncResults());
    }
});

/**
 * Sync results when back online
 */
async function syncResults() {
    try {
        console.log('[ServiceWorker] Syncing results...');
        // Implement sync logic if needed
        // For now, this is a placeholder
        return Promise.resolve();
    } catch (error) {
        console.error('[ServiceWorker] Sync failed:', error);
        throw error;
    }
}

/**
 * Push Event - Handle push notifications (future feature)
 */
self.addEventListener('push', (event) => {
    console.log('[ServiceWorker] Push notification received');

    const options = {
        body: event.data ? event.data.text() : 'Nueva notificación',
        icon: './assets/icons/icon-192.png',
        badge: './assets/icons/icon-72.png',
        vibrate: [200, 100, 200],
        tag: 'hernai-notification',
        requireInteraction: false
    };

    event.waitUntil(
        self.registration.showNotification('Hernai INE Scanner', options)
    );
});

/**
 * Notification Click Event
 */
self.addEventListener('notificationclick', (event) => {
    console.log('[ServiceWorker] Notification clicked');

    event.notification.close();

    event.waitUntil(
        clients.openWindow('./')
    );
});

console.log('[ServiceWorker] Loaded and ready');
