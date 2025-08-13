/* Service worker with update prompt flow and GitHub Pages subpath support */
// Share version between app and SW
try { importScripts('./app-version.js'); } catch (e) {}
const VERSION = (typeof self !== 'undefined' && self.APP_VERSION) ? self.APP_VERSION : 'v0.0.0';
const CACHE_NAME = `mini4wd-race-timer-${VERSION}`;

// Build absolute URLs so it works under a subpath scope (e.g., /user/repo/)
const ASSETS = [
  'index.html',
  'styles.css',
  'app.js',
  'app-version.js',
  'manifest.webmanifest',
  'icons/icon.svg'
];
const APP_SHELL = ASSETS.map((p) => new URL(`./${p}`, self.location).toString());
const INDEX_URL = new URL('./index.html', self.location).toString();

self.addEventListener('install', (event) => {
  // Do not call skipWaiting here; wait for user consent
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-HTTP(S) requests like blob: or data:
  if (!/^https?:/.test(request.url)) return;

  // Navigation requests: network first, fallback to cached index
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(INDEX_URL))
    );
    return;
  }

  // Cache-first for same-origin static assets
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
  }
});

// Allow page to request immediate activation of the waiting worker
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
