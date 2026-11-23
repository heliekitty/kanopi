// Offline shell cache. Its name comes from version.js, so a new version means a fresh cache.
importScripts('version.js');
const CACHE = `kanopi-${self.KANOPI_VERSION.version}`;
// Fonts are cached when present (the app falls back to system fonts without them). A missing font file must not stop the install.
const FONTS = [
  'fonts/mouse-memoirs-v19-latin-regular.woff2',
  'fonts/noto-sans-v42-latin-regular.woff2',
  'fonts/noto-sans-v42-latin-600.woff2',
  'fonts/noto-sans-v42-latin-700.woff2'
];

const SHELL = [
  './',
  'index.html',
  'app.js',
  'version.js',
  'avatars.js',
  'avatar-set.js',
  'data.js',
  'store.js',
  'sheets.js',
  'portfolio.js',
  'importer.js',
  'returns.js',
  'manifest.webmanifest',
  'icons/apple-touch-icon.png',
  'icons/apple-touch-icon-dark.png',
  'icons/icon-192-dark.png',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) =>
    cache.addAll(SHELL).then(() => Promise.all(FONTS.map((f) => cache.add(f).catch(() => {}))))
  ));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((hit) => {
      if (hit) return hit;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});
