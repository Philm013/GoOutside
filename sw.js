/**
 * Earth Day Everyday — Service Worker
 *
 * Strategy:
 *  • App shell (HTML/CSS/JS/fonts/icons) — Cache-First, versioned cache.
 *    On activation old caches are purged so deploys are always fresh.
 *  • iNaturalist API calls — Network-First with 5 s timeout, fallback to cache.
 *  • BirdNET model files — Cache-First (large files, rarely change).
 *  • Everything else — Network-only (no stale data risk).
 */

const CACHE_VERSION = 'v20260420d';
const SHELL_CACHE   = `ede-shell-${CACHE_VERSION}`;
const API_CACHE     = 'ede-api-v1';     // long-lived, keyed by URL
const MODEL_CACHE   = 'ede-models-v1';  // BirdNET model shards

// Files that make up the app shell (relative to SW scope /GoOutside/)
const SHELL_URLS = [
    '/GoOutside/',
    '/GoOutside/index.html',
    '/GoOutside/css/tailwind.css',
    '/GoOutside/css/style.css',
    '/GoOutside/manifest.json',
    '/GoOutside/icons/favicon-32.png',
    '/GoOutside/icons/icon-192.png',
    '/GoOutside/icons/icon-512.png',
    '/GoOutside/icons/apple-touch-icon.png',
    '/GoOutside/js/app.js',
    '/GoOutside/js/hud.js',
    '/GoOutside/js/ui.js',
    '/GoOutside/js/map.js',
    '/GoOutside/js/inat.js',
    '/GoOutside/js/data.js',
    '/GoOutside/js/game.js',
    '/GoOutside/js/journal.js',
    '/GoOutside/js/identify.js',
    '/GoOutside/js/haptics.js',
    '/GoOutside/js/multiplayer.js',
    '/GoOutside/js/audio-processor.js',
    '/GoOutside/js/birdnet-worker.js',
];

// ── Install: pre-cache shell ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) =>
            // addAll fails if any URL 404s; use individual fetches so one bad
            // asset doesn't abort the whole install.
            Promise.allSettled(
                SHELL_URLS.map((url) =>
                    fetch(url, { cache: 'no-cache' })
                        .then((res) => { if (res.ok) cache.put(url, res); })
                        .catch(() => { /* non-fatal */ })
                )
            )
        ).then(() => self.skipWaiting())
    );
});

// ── Activate: purge old caches ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((k) => k.startsWith('ede-shell-') && k !== SHELL_CACHE)
                    .map((k) => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle GET requests
    if (request.method !== 'GET') return;

    // ── BirdNET model files (large, stable) — Cache-First ──────────────────
    if (url.hostname === 'birdnet-team.github.io') {
        event.respondWith(cacheFirst(request, MODEL_CACHE));
        return;
    }

    // ── iNaturalist API — Network-First with timeout + cache fallback ───────
    if (url.hostname === 'api.inaturalist.org') {
        event.respondWith(networkFirstWithTimeout(request, API_CACHE, 5000));
        return;
    }

    // ── App shell assets — Cache-First ──────────────────────────────────────
    if (isShellRequest(url)) {
        event.respondWith(cacheFirst(request, SHELL_CACHE));
        return;
    }

    // ── CDN resources (Leaflet, fonts, confetti) — Stale-While-Revalidate ───
    if (isCDN(url)) {
        event.respondWith(staleWhileRevalidate(request, 'ede-cdn-v1'));
        return;
    }

    // Everything else: network only
});

// ── Strategy helpers ──────────────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
    }
}

async function networkFirstWithTimeout(request, cacheName, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(request, { signal: controller.signal });
        clearTimeout(timer);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            // Only cache successful responses; limit API cache to 200 entries
            cache.put(request, response.clone());
            trimCache(cacheName, 200);
        }
        return response;
    } catch {
        clearTimeout(timer);
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: 'offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

async function staleWhileRevalidate(request, cacheName) {
    const cache  = await caches.open(cacheName);
    const cached = await cache.match(request);
    const fetchPromise = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
    }).catch(() => null);
    return cached || fetchPromise;
}

async function trimCache(cacheName, maxEntries) {
    const cache = await caches.open(cacheName);
    const keys  = await cache.keys();
    if (keys.length > maxEntries) {
        await Promise.all(keys.slice(0, keys.length - maxEntries).map((k) => cache.delete(k)));
    }
}

function isShellRequest(url) {
    return (
        url.hostname === self.location.hostname &&
        (url.pathname === '/GoOutside/' ||
         url.pathname === '/GoOutside/index.html' ||
         url.pathname.startsWith('/GoOutside/css/') ||
         url.pathname.startsWith('/GoOutside/js/') ||
         url.pathname.startsWith('/GoOutside/icons/') ||
         url.pathname === '/GoOutside/manifest.json')
    );
}

function isCDN(url) {
    return (
        url.hostname === 'unpkg.com' ||
        url.hostname === 'cdn.jsdelivr.net' ||
        url.hostname === 'fonts.googleapis.com' ||
        url.hostname === 'fonts.gstatic.com'
    );
}

// ── Message: force update ─────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
