const CACHE_NAME = 'gym-assistant-v59';
const CORE_ASSETS = [
  './', './index.html', './manifest.json', './service-worker.js', './music.mp3',
  './favicon.png', './apple-touch-icon.png',
  './assets/gym-icon-1024.png', './assets/gym-icon-180.png',
  './assets/gym-icon-192.png', './assets/gym-icon-512.png'
];
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/dom-to-image-more@2.8.0/dist/dom-to-image-more.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    await Promise.allSettled(CDN_ASSETS.map(url => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  const isLocalAsset = requestUrl.origin === self.location.origin;
  const isCdnAsset = requestUrl.hostname === 'cdn.jsdelivr.net';
  if (!isLocalAsset && !isCdnAsset) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      caches.open(CACHE_NAME).then(cache => cache.put('./index.html', response.clone()));
      return response;
    }).catch(async () => (await caches.match(event.request)) || (await caches.match('./index.html'))));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response && (response.ok || response.type === 'opaque')) {
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
    }
    return response;
  })));
});

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { title: '計時結束', body: event.data ? event.data.text() : '時間到！開始下一組！' };
  }
  event.waitUntil(self.registration.showNotification(payload.title || '計時結束', {
    body: payload.body || '時間到！開始下一組！',
    icon: './assets/gym-icon-192.png',
    badge: './assets/gym-icon-192.png',
    tag: payload.tag || 'gym-timer-finished',
    data: { url: payload.url || './' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL((event.notification.data && event.notification.data.url) || './', self.location.href).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
    const existingClient = windowClients.find(client => client.url.startsWith(self.location.origin));
    if (existingClient) {
      return existingClient.focus();
    }
    return clients.openWindow(targetUrl);
  }));
});
