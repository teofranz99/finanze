// Service worker: rende l'app disponibile offline. Non tocca mai i dati (che stanno in IndexedDB).
// Quando si pubblica una nuova versione, aumentare VERSION.

const VERSION = '0.1.0';
const CACHE = `finanze-${VERSION}`;
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'js/main.js',
  'js/app.js',
  'js/util.js',
  'js/crypto.js',
  'js/db.js',
  'js/vault.js',
  'js/store.js',
  'js/passkey.js',
  'js/backup.js',
  'js/platform.js',
  'js/theme.js',
  'js/sections.js',
  'js/settings.js',
  'js/autolock.js',
  'js/version.js',
  'js/ui/icons.js',
  'js/ui/page.js',
  'js/ui/list.js',
  'js/ui/sheet.js',
  'js/ui/password.js',
  'js/views/lock.js',
  'js/views/setup.js',
  'js/views/home.js',
  'js/views/altro.js',
  'js/views/placeholder.js',
  'js/views/settings.js',
];

const isDev = ['localhost', '127.0.0.1'].includes(self.location.hostname);

self.addEventListener('install', (event) => {
  // cache: 'reload' evita di prendere file vecchi dalla cache HTTP del browser.
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('finanze-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // In sviluppo: prima la rete, così le modifiche si vedono subito.
  if (isDev) {
    event.respondWith(fetch(req).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error()));
    }),
  );
});
