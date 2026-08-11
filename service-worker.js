const CACHE_NAME = 'gym-assistant-v2';
const APP_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './music.mp3',
  './assets/gym-icon-1024.png',
  './assets/gym-icon-180.png',
  './assets/gym-icon-192.png',
  './assets/gym-icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL((event.notification.data && event.notification.data.url) || './', self.location.href).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
    const existingClient = windowClients.find(client => client.url.startsWith(self.location.origin));
    if (existingClient) {
      existingClient.navigate(targetUrl);
      return existingClient.focus();
    }
    return clients.openWindow(targetUrl);
  }));
});
