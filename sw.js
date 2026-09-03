// Service worker — cache-first, così l'app funziona a zero campo
// dopo il primo caricamento (es. su wifi in alloggio o prima di partire).
// IMPORTANTE: se aggiorni i file dell'app, cambia CACHE_NAME (es. v2, v3...)
// altrimenti il telefono continuerà a usare la versione vecchia in cache.

const CACHE_NAME = 'islanda-trip-v101';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './data.js',
  './firebase-config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Domini di Firebase/Google che NON vanno mai intercettati dal service worker:
// Firestore usa connessioni particolari (long-polling/streaming) per la sincronizzazione
// in tempo reale, che si romperebbero se il service worker provasse a metterle in cache.
const BYPASS_HOSTS = [
  'firestore.googleapis.com',
  'firebaseio.com',
  'googleapis.com',
];

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (BYPASS_HOSTS.some((h) => url.hostname.endsWith(h))) {
    return; // lascia che la richiesta vada direttamente in rete, senza passare dalla cache
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached);
    })
  );
});
