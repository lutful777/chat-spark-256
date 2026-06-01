const CACHE_NAME = 'ai-chat-exploit-v1';

// Minimal service worker for PWA installability.
// This worker does NOT aggressively cache HTML to avoid stale-content issues.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/icon-192x192.png',
        '/icon-512x512.png',
        '/manifest.json',
      ]);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Network-first for navigation requests (HTML pages)
  // so the app never gets stuck on a stale shell.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request).then((response) => {
          return response || new Response('Offline', { status: 503 });
        });
      })
    );
    return;
  }

  // For other requests, try cache first, then network.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((response) => {
          // Only cache same-origin static assets
          const url = new URL(event.request.url);
          if (
            url.origin === self.location.origin &&
            (event.request.destination === 'image' ||
              event.request.destination === 'style' ||
              event.request.destination === 'script' ||
              event.request.destination === 'font')
          ) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
      );
    })
  );
});
