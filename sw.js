const CACHE_NAME = 'vcore-v1';

// On n'oblige pas la mise en cache de tout pour l'instant pour éviter les conflits avec l'API Twitch
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // Stratégie réseau par défaut
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});