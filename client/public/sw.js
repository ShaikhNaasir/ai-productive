/* Service worker for the Productivity Assistant PWA.
 *
 * Auth-safety: this worker NEVER caches API or cross-origin requests, so no
 * private user data is ever stored. Only the static app shell (same-origin
 * navigations and build assets) is cached, which enables the offline shell.
 */
// __BUILD_ID__ is replaced at build time (see vite.config.js). A cache name that
// never changes means the activate handler below has nothing to delete, so every
// deploy's content-hashed assets pile up in Cache Storage forever.
const BUILD_ID = '__BUILD_ID__';
const CACHE = `pa-shell-${BUILD_ID}`;
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];
const ASSET_RE = /\.(?:js|css|svg|png|jpg|jpeg|webp|gif|ico|woff2?)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests. Cross-origin (the API lives on another
  // host in production) and the /api path are left to the network — never cached.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api')) {
    return;
  }

  // Navigations: network-first so users get fresh HTML, falling back to the
  // cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // Static assets: cache-first with a background refresh.
  if (ASSET_RE.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
